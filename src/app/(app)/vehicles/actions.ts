"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { vehicleSchema } from "@/lib/validators";
import { Prisma } from "@prisma/client";

function vehicleUniqueError(err: unknown): Error | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
    return null;
  }
  return new Error("Eine Fuhrpark-Einheit mit diesem Namen existiert bereits.");
}

/** Zod-Ausgabe → Prisma-Daten (leere Strings werden zu null). */
function vehicleData(data: ReturnType<typeof vehicleSchema.parse>) {
  return {
    name: data.name.trim(),
    kind: data.kind,
    licensePlate: data.licensePlate?.trim() || null,
    loadCapacityKg: data.loadCapacityKg ?? null,
    grossWeightKg: data.grossWeightKg ?? null,
    requiredLicense: data.requiredLicense?.trim() || null,
    nextInspection: data.nextInspection ?? null,
    notes: data.notes || null,
    active: data.active,
  };
}

export async function createVehicle(input: unknown) {
  await requireRole(CAN_WRITE);
  const data = vehicleSchema.parse(input);
  try {
    const created = await prisma.vehicle.create({
      data: vehicleData(data),
      select: { id: true },
    });
    revalidatePath("/vehicles");
    return created;
  } catch (err) {
    throw vehicleUniqueError(err) ?? err;
  }
}

export async function updateVehicle(id: string, input: unknown) {
  await requireRole(CAN_WRITE);
  const data = vehicleSchema.parse(input);
  try {
    await prisma.vehicle.update({
      where: { id },
      data: vehicleData(data),
      select: { id: true },
    });
    revalidatePath("/vehicles");
    revalidatePath(`/vehicles/${id}`);
  } catch (err) {
    throw vehicleUniqueError(err) ?? err;
  }
}

/**
 * Einheiten mit Einsätzen werden nur deaktiviert — die Disposition der Historie
 * bleibt nachvollziehbar. Der Restrict-FK auf VehicleAssignment ist der
 * DB-Backstop (Muster deletePerson).
 */
export async function deleteVehicle(id: string) {
  await requireRole(CAN_WRITE);
  const assignmentCount = await prisma.vehicleAssignment.count({
    where: { vehicleId: id },
  });
  if (assignmentCount > 0) {
    await prisma.vehicle.update({
      where: { id },
      data: { active: false },
      select: { id: true },
    });
    revalidatePath("/vehicles");
    return { deactivated: true };
  }
  await prisma.vehicle.delete({ where: { id } });
  revalidatePath("/vehicles");
  return { deactivated: false };
}

export async function toggleVehicleActive(id: string, active: boolean) {
  await requireRole(CAN_WRITE);
  await prisma.vehicle.update({
    where: { id },
    data: { active },
    select: { id: true },
  });
  revalidatePath("/vehicles");
  revalidatePath(`/vehicles/${id}`);
}
