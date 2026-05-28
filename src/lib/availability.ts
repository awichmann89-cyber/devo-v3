import { prisma } from "@/lib/prisma";
import { ProjectStatus } from "@prisma/client";

/**
 * Prüft, ob eine Packeinheit im gegebenen Zeitraum schon vermietet ist
 * (basierend auf dem Planungszeitraum aller relevanten Projekte).
 *
 * Liefert eine Liste der konfligierenden Projekt-Assignments.
 */
export async function findConflicts(
  packUnitIds: string[],
  start: Date,
  end: Date,
  excludeProjectId?: string
) {
  if (packUnitIds.length === 0) return [];

  const blockingStatuses: ProjectStatus[] = [
    ProjectStatus.DRAFT,
    ProjectStatus.CONFIRMED,
    ProjectStatus.ACTIVE,
  ];

  return prisma.projectAssignment.findMany({
    where: {
      packUnitId: { in: packUnitIds },
      projectId: excludeProjectId ? { not: excludeProjectId } : undefined,
      project: {
        status: { in: blockingStatuses },
        // Zwei Zeiträume überlappen sich, wenn:
        // A.start <= B.end UND A.end >= B.start
        planningStart: { lte: end },
        planningEnd: { gte: start },
      },
    },
    include: {
      project: { select: { id: true, name: true, status: true, planningStart: true, planningEnd: true } },
      packUnit: { select: { id: true, name: true, code: true } },
    },
  });
}

/**
 * Liefert eine Map: packUnitId -> ist im Zeitraum verfügbar (true) oder belegt (false).
 */
export async function checkAvailability(
  packUnitIds: string[],
  start: Date,
  end: Date,
  excludeProjectId?: string
): Promise<Map<string, boolean>> {
  const conflicts = await findConflicts(packUnitIds, start, end, excludeProjectId);
  const blocked = new Set(conflicts.map((c) => c.packUnitId));
  const map = new Map<string, boolean>();
  for (const id of packUnitIds) {
    map.set(id, !blocked.has(id));
  }
  return map;
}

/**
 * Liefert für jede Packeinheit alle überlappenden Buchungen (inkl. eigenes Projekt),
 * mit Quantity pro Buchung — zur Berechnung von Über-Bestand.
 */
export async function getOverlappingAssignments(
  packUnitIds: string[],
  start: Date,
  end: Date
) {
  if (packUnitIds.length === 0) return [];

  const blockingStatuses: ProjectStatus[] = [
    ProjectStatus.DRAFT,
    ProjectStatus.CONFIRMED,
    ProjectStatus.ACTIVE,
  ];

  return prisma.projectAssignment.findMany({
    where: {
      packUnitId: { in: packUnitIds },
      project: {
        status: { in: blockingStatuses },
        planningStart: { lte: end },
        planningEnd: { gte: start },
      },
    },
    include: {
      project: {
        select: { id: true, name: true, status: true, planningStart: true, planningEnd: true },
      },
    },
  });
}
