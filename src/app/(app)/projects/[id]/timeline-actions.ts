"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { getOverlappingAssignments } from "@/lib/availability";
import type { ProjectStatus } from "@prisma/client";

/**
 * Belegungs-Zeitstrahl für eine gebuchte Material-Zeile (aufklappbar im
 * Material-Tab): alle Projekte, die dasselbe Gerät/Kabel in einem Fenster rund
 * um den Planungszeitraum dieses Projekts belegen — inkl. Stückzahl. Die
 * Tages-Auslastung rechnet der Client aus den Buchungen.
 */

/** Tage vor/nach dem Planungszeitraum, die der Zeitstrahl mit anzeigt. */
const WINDOW_PADDING_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface TimelineBooking {
  projectId: string;
  projectName: string;
  status: ProjectStatus;
  start: string;
  end: string;
  /** Gebuchte Stückzahl (Summe über alle Gruppen des Projekts). */
  quantity: number;
  /** Physisch blockierte Stückzahl (FIXED-Packeinheiten runden auf). */
  effectiveQuantity: number;
  isOwn: boolean;
}

export interface ItemTimeline {
  /** Für Buchungen verfügbarer Bestand (bei Kabeln abzgl. Packeinheiten). */
  capacity: number;
  stock: number;
  /** Nur Kabel: fest in Packeinheiten verbaute Stückzahl. */
  packAllocation: number;
  windowStart: string;
  windowEnd: string;
  projectStart: string;
  projectEnd: string;
  bookings: TimelineBooking[];
}

async function loadWindow(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { id: true, name: true, status: true, planningStart: true, planningEnd: true },
  });
  const windowStart = new Date(project.planningStart.getTime() - WINDOW_PADDING_DAYS * DAY_MS);
  const windowEnd = new Date(project.planningEnd.getTime() + WINDOW_PADDING_DAYS * DAY_MS);
  return { project, windowStart, windowEnd };
}

function sortBookings(bookings: TimelineBooking[]): TimelineBooking[] {
  // Eigenes Projekt zuerst, danach chronologisch.
  return bookings.sort((a, b) => {
    if (a.isOwn !== b.isOwn) return a.isOwn ? -1 : 1;
    return a.start.localeCompare(b.start);
  });
}

export async function getDeviceTimeline(
  projectId: string,
  deviceId: string
): Promise<ItemTimeline> {
  await requireAuth();
  const { project, windowStart, windowEnd } = await loadWindow(projectId);
  const [device, overlap] = await Promise.all([
    prisma.device.findUniqueOrThrow({
      where: { id: deviceId },
      select: { stockQuantity: true },
    }),
    getOverlappingAssignments([deviceId], windowStart, windowEnd),
  ]);

  // Pro Projekt aggregieren — `effectiveQuantity` ist schon der Projekt-Total
  // (siehe getOverlappingAssignments), `quantity` ist pro Buchung.
  const byProject = new Map<string, TimelineBooking>();
  for (const o of overlap) {
    const existing = byProject.get(o.projectId);
    if (existing) {
      existing.quantity += o.quantity;
      continue;
    }
    byProject.set(o.projectId, {
      projectId: o.projectId,
      projectName: o.project.name,
      status: o.project.status,
      start: o.project.planningStart.toISOString(),
      end: o.project.planningEnd.toISOString(),
      quantity: o.quantity,
      effectiveQuantity: o.effectiveQuantity,
      isOwn: o.projectId === project.id,
    });
  }
  for (const b of byProject.values()) {
    if (b.effectiveQuantity < b.quantity) b.effectiveQuantity = b.quantity;
  }

  // Abgeschlossene/stornierte Projekte blockieren nichts und fehlen daher in
  // getOverlappingAssignments — das eigene Projekt soll trotzdem als Balken
  // erscheinen.
  if (!byProject.has(project.id)) {
    const own = await prisma.projectAssignment.aggregate({
      where: { projectId: project.id, deviceId },
      _sum: { quantity: true },
    });
    const qty = own._sum.quantity ?? 0;
    if (qty > 0) {
      byProject.set(project.id, {
        projectId: project.id,
        projectName: project.name,
        status: project.status,
        start: project.planningStart.toISOString(),
        end: project.planningEnd.toISOString(),
        quantity: qty,
        effectiveQuantity: qty,
        isOwn: true,
      });
    }
  }

  return {
    capacity: device.stockQuantity,
    stock: device.stockQuantity,
    packAllocation: 0,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    projectStart: project.planningStart.toISOString(),
    projectEnd: project.planningEnd.toISOString(),
    bookings: sortBookings(Array.from(byProject.values())),
  };
}

export async function getCableTimeline(
  projectId: string,
  cableId: string
): Promise<ItemTimeline> {
  await requireAuth();
  const { project, windowStart, windowEnd } = await loadWindow(projectId);
  const [cable, packAllocs, rows] = await Promise.all([
    prisma.cable.findUniqueOrThrow({
      where: { id: cableId },
      select: { stockQuantity: true },
    }),
    prisma.packUnitCable.findMany({
      where: { cableId },
      select: { quantity: true, packUnit: { select: { stockQuantity: true } } },
    }),
    // Gleiche Regel wie die Kabel-Konflikt-Map der Projektseite: alles außer
    // stornierten Projekten zählt.
    prisma.projectCableAssignment.findMany({
      where: {
        cableId,
        OR: [
          { projectId: project.id },
          {
            project: {
              status: { not: "CANCELLED" },
              kind: { not: "VERKAUF" },
              planningStart: { lte: windowEnd },
              planningEnd: { gte: windowStart },
            },
          },
        ],
      },
      select: {
        quantity: true,
        project: {
          select: { id: true, name: true, status: true, planningStart: true, planningEnd: true },
        },
      },
    }),
  ]);

  const packAllocation = packAllocs.reduce(
    (s, p) => s + p.quantity * (p.packUnit.stockQuantity ?? 1),
    0
  );

  const byProject = new Map<string, TimelineBooking>();
  for (const r of rows) {
    const existing = byProject.get(r.project.id);
    if (existing) {
      existing.quantity += r.quantity;
      existing.effectiveQuantity += r.quantity;
      continue;
    }
    byProject.set(r.project.id, {
      projectId: r.project.id,
      projectName: r.project.name,
      status: r.project.status,
      start: r.project.planningStart.toISOString(),
      end: r.project.planningEnd.toISOString(),
      quantity: r.quantity,
      effectiveQuantity: r.quantity,
      isOwn: r.project.id === project.id,
    });
  }

  return {
    capacity: Math.max(0, cable.stockQuantity - packAllocation),
    stock: cable.stockQuantity,
    packAllocation,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    projectStart: project.planningStart.toISOString(),
    projectEnd: project.planningEnd.toISOString(),
    bookings: sortBookings(Array.from(byProject.values())),
  };
}
