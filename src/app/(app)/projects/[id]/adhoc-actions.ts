"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { nextSortOrderForGroup } from "@/lib/project-sort-order";

type AdHocInput = {
  name: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  groupId: string;
};

function validate(input: AdHocInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Name darf nicht leer sein");
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new Error("Menge muss eine ganze Zahl ≥ 1 sein");
  }
  if (!Number.isFinite(input.unitPrice) || input.unitPrice < 0) {
    throw new Error("Stückpreis muss ≥ 0 sein");
  }
  return { name, description: (input.description ?? "").trim() || null };
}

export async function addAdHocItem(projectId: string, input: AdHocInput) {
  await requireRole(CAN_WRITE);
  const { name, description } = validate(input);

  // Sortierung am Ende der Gruppe — über ALLE Item-Typen, damit ein neues
  // Vorübergehendes Gerät nicht zwischen den existierenden Geräten landet.
  const sortOrder = await nextSortOrderForGroup(projectId, input.groupId);

  await prisma.projectAdHocItem.create({
    data: {
      projectId,
      groupId: input.groupId,
      name,
      description,
      quantity: input.quantity,
      unitPrice: new Prisma.Decimal(input.unitPrice),
      sortOrder,
    },
    select: { id: true },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function updateAdHocItem(itemId: string, input: AdHocInput) {
  await requireRole(CAN_WRITE);
  const { name, description } = validate(input);
  const updated = await prisma.projectAdHocItem.update({
    where: { id: itemId },
    data: {
      name,
      description,
      quantity: input.quantity,
      unitPrice: new Prisma.Decimal(input.unitPrice),
      groupId: input.groupId,
    },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${updated.projectId}`);
}

export async function deleteAdHocItem(itemId: string) {
  await requireRole(CAN_WRITE);
  const item = await prisma.projectAdHocItem.delete({
    where: { id: itemId },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${item.projectId}`);
}

export async function moveAdHocItemToGroup(itemId: string, groupId: string) {
  await requireRole(CAN_WRITE);
  const item = await prisma.projectAdHocItem.update({
    where: { id: itemId },
    data: { groupId },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${item.projectId}`);
}
