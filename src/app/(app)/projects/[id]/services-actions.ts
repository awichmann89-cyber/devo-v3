"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { projectServiceSchema } from "@/lib/validators";
import { Prisma, ServiceItemKind } from "@prisma/client";
import { nextSortOrderForGroup } from "@/lib/project-sort-order";

/**
 * Bucht eine Katalog-Position auf ein Projekt. Trägt eine Transport-Position
 * eine Standard-Fuhrpark-Einheit (ServiceItem.defaultVehicleId), wird diese
 * gleich mit eingeplant — ohne Zeitangaben, also für den gesamten
 * Planungszeitraum geblockt. Der Rückgabewert nennt die eingeplante Einheit,
 * damit die UI es zurückmelden kann.
 */
export async function addProjectService(
  projectId: string,
  input: unknown
): Promise<{ vehicleName: string | null }> {
  await requireRole(CAN_WRITE);
  const data = projectServiceSchema.parse(input);

  const item = await prisma.serviceItem.findUnique({
    where: { id: data.serviceItemId },
    select: {
      kind: true,
      defaultVehicleId: true,
      defaultVehicle: { select: { id: true, name: true, active: true } },
    },
  });
  if (!item) throw new Error("Position nicht gefunden");

  // sortOrder = max(gruppe) + 1, damit neue Service-Positionen am Ende der
  // Gruppe einsortiert werden statt mit Default 0 oben aufzutauchen.
  const sortOrder = await nextSortOrderForGroup(projectId, data.groupId);

  // Inaktive Einheiten werden übersprungen — sie sollen nicht durch die
  // Hintertür der Vorbelegung wieder in die Planung kommen.
  const autoVehicle =
    item.kind === ServiceItemKind.TRANSPORT && item.defaultVehicle?.active
      ? item.defaultVehicle
      : null;

  // Position und automatischer Einsatz gehören zusammen: entweder beides oder
  // nichts — sonst stünde die Transport-Zeile ohne ihre Einheit da.
  await prisma.$transaction(async (tx) => {
    const created = await tx.projectService.create({
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
    if (autoVehicle) {
      await tx.vehicleAssignment.create({
        data: {
          projectServiceId: created.id,
          projectId,
          vehicleId: autoVehicle.id,
        },
        select: { id: true },
      });
    }
  });

  if (autoVehicle) {
    revalidatePath("/vehicles");
    revalidatePath(`/vehicles/${autoVehicle.id}`);
  }

  revalidatePath(`/projects/${projectId}`);
  return { vehicleName: autoVehicle?.name ?? null };
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
