import { prisma } from "@/lib/prisma";
import { ProjectStatus } from "@prisma/client";

/**
 * Prüft, ob die gegebenen Geräte im Zeitraum schon (über-) gebucht sind.
 *
 * Liefert eine Liste der konfligierenden Projekt-Assignments
 * (mit Projekt-Infos), ohne den Verfügbarkeits-Vergleich mit stockQuantity zu
 * machen — das ist Sache des Aufrufers (siehe `getOverlappingAssignments`).
 */
export async function findConflicts(
  deviceIds: string[],
  start: Date,
  end: Date,
  excludeProjectId?: string
) {
  if (deviceIds.length === 0) return [];

  const blockingStatuses: ProjectStatus[] = [
    ProjectStatus.DRAFT,
    ProjectStatus.CONFIRMED,
    ProjectStatus.ACTIVE,
  ];

  return prisma.projectAssignment.findMany({
    where: {
      deviceId: { in: deviceIds },
      projectId: excludeProjectId ? { not: excludeProjectId } : undefined,
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
      device: { select: { id: true, name: true, stockQuantity: true } },
    },
  });
}

/**
 * Liefert für jedes Gerät alle überlappenden Buchungen (inkl. eigenes Projekt),
 * mit Quantity pro Buchung — zur Berechnung von Über-Bestand.
 */
export async function getOverlappingAssignments(
  deviceIds: string[],
  start: Date,
  end: Date
) {
  if (deviceIds.length === 0) return [];

  const blockingStatuses: ProjectStatus[] = [
    ProjectStatus.DRAFT,
    ProjectStatus.CONFIRMED,
    ProjectStatus.ACTIVE,
  ];

  return prisma.projectAssignment.findMany({
    where: {
      deviceId: { in: deviceIds },
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
