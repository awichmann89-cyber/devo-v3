"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { cableAssignmentSchema } from "@/lib/validators";

/**
 * Bucht ein Kabel in ein Projekt — analog zu addAssignment für Geräte.
 * groupId muss zu einer CABLE-Gruppe gehören.
 */
export async function addCableAssignment(projectId: string, input: unknown) {
  await requireRole(CAN_WRITE);
  const data = cableAssignmentSchema.parse(input);

  // Immer eine neue Buchung anlegen — dasselbe Kabel darf bewusst mehrfach
  // im Projekt vorkommen (z.B. einmal pro Gruppe). Anzahl-Änderungen laufen
  // über updateCableAssignmentQuantity.
  await prisma.projectCableAssignment.create({
    data: {
      projectId,
      cableId: data.cableId,
      groupId: data.groupId,
      quantity: data.quantity,
      notes: data.notes || null,
    },
    select: { id: true },
  });

  revalidatePath(`/projects/${projectId}`);
}

/**
 * Stellt sicher, dass es mindestens eine CABLE-Gruppe gibt, und gibt deren ID zurück.
 * Wird vom Cable-Tab beim ersten Buchen gerufen, damit keine Material-Gruppe missbraucht wird.
 */
export async function ensureDefaultCableGroup(projectId: string): Promise<string> {
  await requireRole(CAN_WRITE);
  const existing = await prisma.projectGroup.findFirst({
    where: { projectId, kind: "CABLE" },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.projectGroup.create({
    data: {
      projectId,
      kind: "CABLE",
      name: "Kabel",
      sortOrder: 0,
    },
    select: { id: true },
  });
  revalidatePath(`/projects/${projectId}`);
  return created.id;
}

export async function removeCableAssignment(projectId: string, assignmentId: string) {
  await requireRole(CAN_WRITE);
  await prisma.projectCableAssignment.delete({ where: { id: assignmentId } });
  revalidatePath(`/projects/${projectId}`);
}

export async function updateCableAssignmentQuantity(
  projectId: string,
  assignmentId: string,
  quantity: number
) {
  await requireRole(CAN_WRITE);
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("Menge muss eine ganze Zahl ≥ 1 sein");
  }
  await prisma.projectCableAssignment.update({
    where: { id: assignmentId },
    data: { quantity },
    select: { id: true },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function moveCableAssignmentToGroup(
  projectId: string,
  assignmentId: string,
  groupId: string
) {
  await requireRole(CAN_WRITE);
  await prisma.projectCableAssignment.update({
    where: { id: assignmentId },
    data: { groupId },
    select: { id: true },
  });
  revalidatePath(`/projects/${projectId}`);
}
