"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { cableAssignmentSchema } from "@/lib/validators";
import { nextSortOrderForGroup } from "@/lib/project-sort-order";

/**
 * Bucht ein Kabel in ein Projekt — analog zu addAssignment für Geräte.
 * groupId ist eine ganz normale MATERIAL-Gruppe: Kabel und Geräte liegen
 * gemeinsam in denselben Gruppen.
 */
export async function addCableAssignment(projectId: string, input: unknown) {
  await requireRole(CAN_WRITE);
  const data = cableAssignmentSchema.parse(input);

  // Immer eine neue Buchung anlegen — dasselbe Kabel darf bewusst mehrfach
  // im Projekt vorkommen (z.B. einmal pro Gruppe). Anzahl-Änderungen laufen
  // über updateCableAssignmentQuantity.
  // sortOrder = max(gruppe) + 1 sorgt dafür, dass neue Kabel am Ende der
  // Gruppe einsortiert werden statt oben (Default 0).
  const sortOrder = await nextSortOrderForGroup(projectId, data.groupId);
  await prisma.projectCableAssignment.create({
    data: {
      projectId,
      cableId: data.cableId,
      groupId: data.groupId,
      quantity: data.quantity,
      notes: data.notes || null,
      sortOrder,
    },
    select: { id: true },
  });

  revalidatePath(`/projects/${projectId}`);
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
