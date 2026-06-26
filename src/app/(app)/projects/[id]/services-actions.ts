"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { projectServiceSchema } from "@/lib/validators";
import { Prisma } from "@prisma/client";
import { nextSortOrderForGroup } from "@/lib/project-sort-order";

export async function addProjectService(projectId: string, input: unknown) {
  await requireRole(CAN_WRITE);
  const data = projectServiceSchema.parse(input);

  // sortOrder = max(gruppe) + 1, damit neue Service-Positionen am Ende der
  // Gruppe einsortiert werden statt mit Default 0 oben aufzutauchen.
  const sortOrder = await nextSortOrderForGroup(projectId, data.groupId);

  await prisma.projectService.create({
    data: {
      projectId,
      serviceItemId: data.serviceItemId,
      groupId: data.groupId,
      quantity: data.quantity,
      unitPriceOverride:
        data.unitPriceOverride === null || data.unitPriceOverride === undefined
          ? null
          : new Prisma.Decimal(data.unitPriceOverride),
      notes: data.notes || null,
      sortOrder,
    },
    select: { id: true },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function updateProjectService(
  id: string,
  input: { quantity?: number; unitPriceOverride?: number | null; notes?: string | null; groupId?: string }
) {
  await requireRole(CAN_WRITE);
  const ps = await prisma.projectService.update({
    where: { id },
    data: {
      quantity: input.quantity ?? undefined,
      groupId: input.groupId ?? undefined,
      unitPriceOverride:
        input.unitPriceOverride === undefined
          ? undefined
          : input.unitPriceOverride === null
          ? null
          : new Prisma.Decimal(input.unitPriceOverride),
      notes: input.notes === undefined ? undefined : input.notes || null,
    },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${ps.projectId}`);
}

export async function removeProjectService(id: string) {
  await requireRole(CAN_WRITE);
  const ps = await prisma.projectService.delete({
    where: { id },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${ps.projectId}`);
}

export async function moveProjectServiceToGroup(id: string, groupId: string) {
  await requireRole(CAN_WRITE);
  const ps = await prisma.projectService.update({
    where: { id },
    data: { groupId },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${ps.projectId}`);
}
