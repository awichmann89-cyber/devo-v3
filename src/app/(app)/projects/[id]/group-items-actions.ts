"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";

export type GroupItemKind =
  | "DEVICE"
  | "CABLE"
  | "SERVICE"
  | "ADHOC"
  | "COMMENT";

/**
 * Speichert die neue Reihenfolge aller Items einer Gruppe.
 * Der `sortOrder`-Index ist gruppenweit, also gemeinsam für Geräte, Kabel,
 * Services, AdHoc-Positionen und Kommentare. Welche Typen sich in einer
 * Gruppe befinden, hängt vom `kind` der Gruppe ab (MATERIAL → Geräte +
 * AdHoc, CABLE → Kabel, SERVICE → Services); Kommentare können in jeder.
 */
export async function reorderGroupItems(
  projectId: string,
  items: { kind: GroupItemKind; id: string }[]
): Promise<void> {
  await requireRole(CAN_WRITE);

  const ops = items.map((it, idx) => {
    switch (it.kind) {
      case "DEVICE":
        return prisma.projectAssignment.update({
          where: { id: it.id },
          data: { sortOrder: idx },
          select: { id: true },
        });
      case "CABLE":
        return prisma.projectCableAssignment.update({
          where: { id: it.id },
          data: { sortOrder: idx },
          select: { id: true },
        });
      case "SERVICE":
        return prisma.projectService.update({
          where: { id: it.id },
          data: { sortOrder: idx },
          select: { id: true },
        });
      case "ADHOC":
        return prisma.projectAdHocItem.update({
          where: { id: it.id },
          data: { sortOrder: idx },
          select: { id: true },
        });
      case "COMMENT":
        return prisma.projectGroupComment.update({
          where: { id: it.id },
          data: { sortOrder: idx },
          select: { id: true },
        });
    }
  });

  await prisma.$transaction(ops);
  revalidatePath(`/projects/${projectId}`);
}

export async function addGroupComment(
  projectId: string,
  groupId: string,
  text: string
): Promise<{ id: string }> {
  await requireRole(CAN_WRITE);
  const t = text.trim();
  if (!t) throw new Error("Text darf nicht leer sein");

  // Am Ende der Gruppe einsortieren
  const last = await prisma.projectGroupComment.findFirst({
    where: { groupId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const created = await prisma.projectGroupComment.create({
    data: { projectId, groupId, text: t, sortOrder },
    select: { id: true },
  });
  revalidatePath(`/projects/${projectId}`);
  return created;
}

export async function updateGroupComment(
  commentId: string,
  text: string
): Promise<void> {
  await requireRole(CAN_WRITE);
  const t = text.trim();
  if (!t) throw new Error("Text darf nicht leer sein");
  const c = await prisma.projectGroupComment.update({
    where: { id: commentId },
    data: { text: t },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${c.projectId}`);
}

export async function deleteGroupComment(commentId: string): Promise<void> {
  await requireRole(CAN_WRITE);
  const c = await prisma.projectGroupComment.delete({
    where: { id: commentId },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${c.projectId}`);
}
