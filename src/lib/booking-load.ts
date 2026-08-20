// Laden und Bewerten von Ressourcen-Belegungen (Personal und Fuhrpark) —
// serverseitiges Gegenstück zu lib/booking-conflicts.ts.
//
// Beide Ressourcen-Arten hängen an einer Preiszeile (ProjectService) und tragen
// dieselbe Zeit-Fallback-Kette (Uhrzeiten → Berechnungszeitraum →
// Projekt-Planungszeitraum, siehe lib/personnel-schedule.ts). Deshalb werden
// sie hier auf EINE Buchungs-Form normalisiert, damit Projektseite,
// Einplanungs-Dialoge und die Stammdaten-Detailseiten dieselbe Auswertung
// benutzen.
//
// Stornierte Projekte blockieren niemanden und fallen überall heraus.

import { prisma } from "@/lib/prisma";
import { ProjectStatus } from "@prisma/client";
import { assignmentEffectiveRange } from "@/lib/personnel-schedule";
import { collectConflicts, type ConflictHit } from "@/lib/booking-conflicts";

/** Eine Belegung einer Ressource (Person oder Fuhrpark-Einheit). */
export interface ResourceBooking {
  /** Id des Einsatzes (PersonAssignment / VehicleAssignment). */
  id: string;
  /** Id der belegten Ressource (personId / vehicleId). */
  resourceId: string;
  resourceName: string;
  projectId: string;
  projectName: string;
  projectStatus: ProjectStatus;
  /** Bezeichnung der Preiszeile, an der der Einsatz hängt. */
  serviceName: string;
  /** Nur Fuhrpark: eingetragener Fahrer. */
  driverName: string | null;
  notes: string | null;
  /** Effektives Zeitfenster als halboffenes Intervall [start, end). */
  start: Date;
  end: Date;
  timed: boolean;
}

/** Belegungs-Intervall für Client-Warnungen (ISO-Strings). */
export interface BusyIntervalDTO {
  projectName: string;
  start: string;
  end: string;
  timed: boolean;
}

/**
 * Personaleinsätze als normalisierte Belegungen.
 * Leere Id-Liste → keine Query (der Regelfall bei Projekten ohne Personal).
 */
export async function loadPersonBookings(
  personIds: string[]
): Promise<ResourceBooking[]> {
  if (personIds.length === 0) return [];

  const rows = await prisma.personAssignment.findMany({
    where: {
      personId: { in: personIds },
      project: { is: { status: { not: ProjectStatus.CANCELLED } } },
    },
    select: {
      id: true,
      personId: true,
      plannedStart: true,
      plannedEnd: true,
      notes: true,
      person: { select: { name: true } },
      billingPeriod: { select: { start: true, end: true } },
      projectService: { select: { serviceItem: { select: { name: true } } } },
      project: {
        select: {
          id: true,
          name: true,
          status: true,
          planningStart: true,
          planningEnd: true,
        },
      },
    },
  });

  return rows.map((a) => {
    const range = assignmentEffectiveRange({
      plannedStart: a.plannedStart,
      plannedEnd: a.plannedEnd,
      billingPeriod: a.billingPeriod,
      projectPlanningStart: a.project.planningStart,
      projectPlanningEnd: a.project.planningEnd,
    });
    return {
      id: a.id,
      resourceId: a.personId,
      resourceName: a.person.name,
      projectId: a.project.id,
      projectName: a.project.name,
      projectStatus: a.project.status,
      serviceName: a.projectService.serviceItem.name,
      driverName: null,
      notes: a.notes,
      ...range,
    };
  });
}

/**
 * Fuhrpark-Einsätze als normalisierte Belegungen.
 * `vehicleIds = null` lädt alle Einheiten (Stammdaten-Liste), ein leeres Array
 * liefert nichts.
 */
export async function loadVehicleBookings(
  vehicleIds: string[] | null
): Promise<ResourceBooking[]> {
  if (vehicleIds !== null && vehicleIds.length === 0) return [];

  const rows = await prisma.vehicleAssignment.findMany({
    where: {
      vehicleId: vehicleIds !== null ? { in: vehicleIds } : undefined,
      project: { is: { status: { not: ProjectStatus.CANCELLED } } },
    },
    select: {
      id: true,
      vehicleId: true,
      plannedStart: true,
      plannedEnd: true,
      notes: true,
      vehicle: { select: { name: true } },
      driver: { select: { name: true } },
      billingPeriod: { select: { start: true, end: true } },
      projectService: { select: { serviceItem: { select: { name: true } } } },
      project: {
        select: {
          id: true,
          name: true,
          status: true,
          planningStart: true,
          planningEnd: true,
        },
      },
    },
  });

  return rows.map((a) => {
    const range = assignmentEffectiveRange({
      plannedStart: a.plannedStart,
      plannedEnd: a.plannedEnd,
      billingPeriod: a.billingPeriod,
      projectPlanningStart: a.project.planningStart,
      projectPlanningEnd: a.project.planningEnd,
    });
    return {
      id: a.id,
      resourceId: a.vehicleId,
      resourceName: a.vehicle.name,
      projectId: a.project.id,
      projectName: a.project.name,
      projectStatus: a.project.status,
      serviceName: a.projectService.serviceItem.name,
      driverName: a.driver?.name ?? null,
      notes: a.notes,
      ...range,
    };
  });
}

/**
 * Belegungen je Ressource als ISO-Intervalle für die Client-Dialoge
 * („bereits eingeplant in …"). `excludeProjectId` blendet das eigene Projekt
 * aus, damit der Dialog nur Fremdbelegungen zeigt.
 */
export function busyIntervalsByResource(
  bookings: ResourceBooking[],
  excludeProjectId?: string
): Record<string, BusyIntervalDTO[]> {
  const out: Record<string, BusyIntervalDTO[]> = {};
  for (const b of bookings) {
    if (excludeProjectId && b.projectId === excludeProjectId) continue;
    (out[b.resourceId] ??= []).push({
      projectName: b.projectName,
      start: b.start.toISOString(),
      end: b.end.toISOString(),
      timed: b.timed,
    });
  }
  return out;
}

/**
 * Konflikte je Einsatz — bewertet jede Belegung gegen die Belegungen derselben
 * Ressource in ANDEREN Projekten. Innerhalb eines Projekts ist Mehrfach-
 * Einplanung gewollt (zwei Schichten, zwei Fahrten) und daher kein Konflikt.
 *
 * Erwartet alle relevanten Belegungen der betrachteten Ressourcen — wer nur
 * eine Teilmenge lädt, bekommt auch nur Konflikte innerhalb dieser Teilmenge.
 */
export function conflictsByBooking(
  bookings: ResourceBooking[]
): Record<string, ConflictHit[]> {
  const byResource = new Map<string, ResourceBooking[]>();
  for (const b of bookings) {
    const arr = byResource.get(b.resourceId) ?? [];
    arr.push(b);
    byResource.set(b.resourceId, arr);
  }

  const out: Record<string, ConflictHit[]> = {};
  for (const [, group] of byResource) {
    if (group.length < 2) continue;
    for (const candidate of group) {
      const foreign = group.filter((o) => o.projectId !== candidate.projectId);
      if (foreign.length === 0) continue;
      const hits = collectConflicts(candidate, foreign);
      if (hits.length > 0) out[candidate.id] = hits;
    }
  }
  return out;
}
