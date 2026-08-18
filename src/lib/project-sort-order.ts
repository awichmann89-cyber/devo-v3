import { prisma } from "@/lib/prisma";

/**
 * Berechnet die nächste sortOrder für ein neues Item innerhalb einer
 * Projekt-Gruppe — über ALLE Item-Typen hinweg.
 *
 * Hintergrund: Innerhalb einer Gruppe (Material, Cable, Service) können
 * verschiedene Item-Typen koexistieren: ProjectAssignment, ProjectAdHocItem,
 * ProjectCableAssignment, ProjectService und ProjectGroupComment. Sie teilen
 * sich denselben sortOrder-Raum, weil sie in der UI nach `sortOrder` gemischt
 * angezeigt werden (Drag & Drop sortiert sie gemeinsam um).
 *
 * Wenn wir nur Max innerhalb einer Tabelle nehmen würden, könnte z.B. ein
 * neuer Kommentar bei sortOrder=4 landen, obwohl die Geräte schon bei
 * sortOrder=10 sind — der Kommentar würde dann mittendrin reinrutschen.
 *
 * Daher: ein Helper, der das Max über alle 5 Tabellen für eine Gruppe
 * findet, +1 gibt, und so neue Items zuverlässig ans Ende der Gruppe setzt.
 */
export async function nextSortOrderForGroup(
  projectId: string,
  groupId: string,
): Promise<number> {
  const [assign, adHoc, comment, cable, service, subhire] = await Promise.all([
    prisma.projectAssignment.findFirst({
      where: { projectId, groupId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    }),
    prisma.projectAdHocItem.findFirst({
      where: { projectId, groupId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    }),
    prisma.projectGroupComment.findFirst({
      where: { projectId, groupId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    }),
    prisma.projectCableAssignment.findFirst({
      where: { projectId, groupId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    }),
    prisma.projectService.findFirst({
      where: { projectId, groupId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    }),
    // Freie (nicht mit einem Gerät verknüpfte) Zumietungen teilen sich denselben
    // sortOrder-Raum, weil sie als eigene Zeile in der Gruppe erscheinen.
    prisma.projectSubhire.findFirst({
      where: { projectId, groupId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    }),
  ]);
  const max = Math.max(
    assign?.sortOrder ?? -1,
    adHoc?.sortOrder ?? -1,
    comment?.sortOrder ?? -1,
    cable?.sortOrder ?? -1,
    service?.sortOrder ?? -1,
    subhire?.sortOrder ?? -1,
  );
  return max + 1;
}

/**
 * Wie `nextSortOrderForGroup`, aber für Gruppen auf der Kosten-Seite
 * (kind COST). Dort teilen sich Zumietungen (costSortOrder),
 * Extrakosten (sortOrder) und Zwischenüberschriften (sortOrder) den
 * sortOrder-Raum der Gruppe.
 */
export async function nextCostSortOrderForGroup(
  projectId: string,
  groupId: string,
): Promise<number> {
  const [subhire, extra, comment] = await Promise.all([
    prisma.projectSubhire.findFirst({
      where: { projectId, costGroupId: groupId },
      orderBy: { costSortOrder: "desc" },
      select: { costSortOrder: true },
    }),
    prisma.projectExtraCost.findFirst({
      where: { projectId, groupId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    }),
    prisma.projectGroupComment.findFirst({
      where: { projectId, groupId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    }),
  ]);
  const max = Math.max(
    subhire?.costSortOrder ?? -1,
    extra?.sortOrder ?? -1,
    comment?.sortOrder ?? -1,
  );
  return max + 1;
}
