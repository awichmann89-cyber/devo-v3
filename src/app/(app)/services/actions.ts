"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { serviceItemSchema } from "@/lib/validators";
import { Prisma, ServiceItemKind } from "@prisma/client";

/**
 * Prüft die Standard-Fuhrpark-Einheit einer Transport-Position: sie muss
 * existieren und aktiv sein, sonst würde beim Buchen still nichts eingeplant.
 */
async function validateDefaultVehicle(
  kind: ServiceItemKind,
  vehicleId: string | null | undefined
): Promise<string | null> {
  if (!vehicleId || kind !== ServiceItemKind.TRANSPORT) return null;
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { active: true },
  });
  if (!vehicle) throw new Error("Fuhrpark-Einheit nicht gefunden");
  if (!vehicle.active) {
    throw new Error("Inaktive Fuhrpark-Einheiten können nicht vorbelegt werden");
  }
  return vehicleId;
}

export async function createServiceItem(input: unknown) {
  await requireRole(CAN_WRITE);
  const data = serviceItemSchema.parse(input);
  const defaultVehicleId = await validateDefaultVehicle(
    data.kind,
    data.defaultVehicleId
  );
  try {
    const created = await prisma.serviceItem.create({
      data: {
        name: data.name.trim(),
        externalName: data.externalName,
        description: data.description || null,
        kind: data.kind,
        unit: data.unit,
        unitPrice: data.unitPrice,
        active: data.active,
        defaultVehicleId,
      },
      select: {
        id: true,
        name: true,
        externalName: true,
        kind: true,
        unit: true,
        unitPrice: true,
        active: true,
        description: true,
        defaultVehicleId: true,
      },
    });
    revalidatePath("/services");
    return {
      ...created,
      unitPrice: Number(created.unitPrice),
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error("Eine Position mit diesem Namen existiert bereits.");
    }
    throw err;
  }
}

export async function updateServiceItem(id: string, input: unknown) {
  await requireRole(CAN_WRITE);
  const data = serviceItemSchema.parse(input);
  const defaultVehicleId = await validateDefaultVehicle(
    data.kind,
    data.defaultVehicleId
  );
  try {
    await prisma.serviceItem.update({
      where: { id },
      data: {
        name: data.name.trim(),
        externalName: data.externalName,
        description: data.description || null,
        kind: data.kind,
        unit: data.unit,
        unitPrice: data.unitPrice,
        active: data.active,
        defaultVehicleId,
      },
      select: { id: true },
    });
    revalidatePath("/services");
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error("Eine Position mit diesem Namen existiert bereits.");
    }
    throw err;
  }
}

export async function deleteServiceItem(id: string) {
  await requireRole(CAN_WRITE);
  // Wenn Position in Projekten verwendet wird, nur deaktivieren statt löschen
  const usedCount = await prisma.projectService.count({ where: { serviceItemId: id } });
  if (usedCount > 0) {
    await prisma.serviceItem.update({
      where: { id },
      data: { active: false },
      select: { id: true },
    });
    revalidatePath("/services");
    return { deactivated: true };
  }
  await prisma.serviceItem.delete({ where: { id } });
  revalidatePath("/services");
  return { deactivated: false };
}

export async function toggleServiceItemActive(id: string, active: boolean) {
  await requireRole(CAN_WRITE);
  await prisma.serviceItem.update({
    where: { id },
    data: { active },
    select: { id: true },
  });
  revalidatePath("/services");
}
