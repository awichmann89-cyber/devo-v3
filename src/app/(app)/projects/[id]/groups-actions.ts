"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { ProjectGroupKind } from "@prisma/client";

/**
 * Stellt sicher, dass ein Projekt mindestens eine Gruppe vom angegebenen Typ hat.
 * Wird beim ersten Hinzufügen von Material/Service aufgerufen.
 * Gibt die ID der (default-)Gruppe zurück.
 */
export async function ensureDefaultGroup(
  projectId: string,
  kind: ProjectGroupKind
): Promise<string> {
  const existing = await prisma.projectGroup.findFirst({
    where: { projectId, kind },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.projectGroup.create({
    data: {
      projectId,
      kind,
      name: "Allgemein",
      sortOrder: 0,
    },
    select: { id: true },
  });
  return created.id;
}

export async function createProjectGroup(
  projectId: string,
  input: { name: string; kind: ProjectGroupKind }
) {
  await requireRole(CAN_WRITE);
  const name = input.name.trim();
  if (!name) throw new Error("Name darf nicht leer sein");

  // Höchste sortOrder ermitteln
  const last = await prisma.projectGroup.findFirst({
    where: { projectId, kind: input.kind },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const created = await prisma.projectGroup.create({
    data: { projectId, kind: input.kind, name, sortOrder },
    select: { id: true },
  });

  revalidatePath(`/projects/${projectId}`);
  return { id: created.id };
}

export async function renameProjectGroup(id: string, name: string) {
  await requireRole(CAN_WRITE);
  const t = name.trim();
  if (!t) throw new Error("Name darf nicht leer sein");
  const g = await prisma.projectGroup.update({
    where: { id },
    data: { name: t },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${g.projectId}`);
}

/**
 * Löscht eine Gruppe. Wenn `moveToGroupId` gesetzt, werden enthaltene Items
 * dorthin verschoben. Ansonsten werden sie mitgelöscht (Cascade).
 */
export async function deleteProjectGroup(
  id: string,
  moveToGroupId?: string | null
) {
  await requireRole(CAN_WRITE);

  const group = await prisma.projectGroup.findUnique({
    where: { id },
    select: { projectId: true, kind: true },
  });
  if (!group) throw new Error("Gruppe nicht gefunden");

  if (moveToGroupId) {
    // Prüfen, dass Zielgruppe denselben kind hat
    const target = await prisma.projectGroup.findUnique({
      where: { id: moveToGroupId },
      select: { projectId: true, kind: true },
    });
    if (!target || target.projectId !== group.projectId || target.kind !== group.kind) {
      throw new Error("Zielgruppe ist ungültig");
    }

    await prisma.$transaction([
      ...(group.kind === "MATERIAL"
        ? [
            prisma.projectAssignment.updateMany({
              where: { groupId: id },
              data: { groupId: moveToGroupId },
            }),
          ]
        : [
            prisma.projectService.updateMany({
              where: { groupId: id },
              data: { groupId: moveToGroupId },
            }),
          ]),
      prisma.projectGroup.delete({ where: { id } }),
    ]);
  } else {
    await prisma.projectGroup.delete({ where: { id } });
  }

  revalidatePath(`/projects/${group.projectId}`);
}

export async function reorderProjectGroups(orderedIds: string[]) {
  await requireRole(CAN_WRITE);
  if (orderedIds.length === 0) return;

  // Alle gehören demselben Projekt? -> erste laden für Path
  const first = await prisma.projectGroup.findUnique({
    where: { id: orderedIds[0] },
    select: { projectId: true },
  });

  await prisma.$transaction(
    orderedIds.map((id, idx) =>
      prisma.projectGroup.update({
        where: { id },
        data: { sortOrder: idx },
        select: { id: true },
      })
    )
  );

  if (first) revalidatePath(`/projects/${first.projectId}`);
}
