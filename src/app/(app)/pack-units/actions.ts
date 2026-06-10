"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { packUnitSchema, packUnitItemSchema } from "@/lib/validators";
import { generateNextPackUnitCode } from "@/lib/id-generator";

function normalize(input: unknown) {
  const data = packUnitSchema.parse(input);
  return {
    ...data,
    locationId: data.locationId || null,
    categoryId: data.categoryId || null,
    weight: data.weight ?? null,
  };
}

export async function createPackUnit(input: unknown) {
  await requireRole(CAN_WRITE);
  const data = normalize(input);
  const code = data.code ?? (await generateNextPackUnitCode());
  const created = await prisma.packUnit.create({
    data: { ...data, code },
    select: { id: true },
  });
  revalidatePath("/material");
  redirect(`/pack-units/${created.id}`);
}

export async function updatePackUnit(id: string, input: unknown) {
  await requireRole(CAN_WRITE);
  const data = normalize(input);
  if (!data.code) {
    const existing = await prisma.packUnit.findUnique({ where: { id }, select: { code: true } });
    if (!existing) throw new Error("Packeinheit nicht gefunden");
    data.code = existing.code;
  }
  await prisma.packUnit.update({
    where: { id },
    data: { ...data, code: data.code },
    select: { id: true },
  });
  revalidatePath("/material");
  revalidatePath(`/pack-units/${id}`);
}

export async function deletePackUnit(id: string) {
  await requireRole(CAN_WRITE);
  await prisma.packUnit.delete({ where: { id } });
  revalidatePath("/material");
  redirect("/material?tab=pack-units");
}

/** Schnell-Update für den Lagerbestand einer Packeinheit. */
export async function updatePackUnitStock(id: string, stockQuantity: number) {
  await requireRole(CAN_WRITE);
  if (!Number.isInteger(stockQuantity) || stockQuantity < 1) {
    throw new Error("Lagerbestand muss eine ganze Zahl ≥ 1 sein");
  }
  await prisma.packUnit.update({
    where: { id },
    data: { stockQuantity },
    select: { id: true },
  });
  revalidatePath("/material");
  revalidatePath(`/pack-units/${id}`);
}

// ---------- PackUnit-Inhalt (Device-Items) ----------

/**
 * Fügt ein Gerät einer Packeinheit hinzu (oder erhöht die Anzahl pro Case).
 */
export async function addItemToPackUnit(
  packUnitId: string,
  input: unknown
) {
  await requireRole(CAN_WRITE);
  const data = packUnitItemSchema.parse(input);

  await prisma.packUnitDevice.upsert({
    where: {
      packUnitId_deviceId: { packUnitId, deviceId: data.deviceId },
    },
    update: { quantity: data.quantity, notes: data.notes || null },
    create: {
      packUnitId,
      deviceId: data.deviceId,
      quantity: data.quantity,
      notes: data.notes || null,
    },
    select: { id: true },
  });
  revalidatePath(`/pack-units/${packUnitId}`);
  revalidatePath("/material");
}

export async function updateItemQuantity(itemId: string, quantity: number) {
  await requireRole(CAN_WRITE);
  if (quantity < 1) throw new Error("Anzahl muss mindestens 1 sein");
  const item = await prisma.packUnitDevice.update({
    where: { id: itemId },
    data: { quantity },
    select: { packUnitId: true },
  });
  revalidatePath(`/pack-units/${item.packUnitId}`);
  revalidatePath("/material");
}

export async function removeItemFromPackUnit(itemId: string) {
  await requireRole(CAN_WRITE);
  const item = await prisma.packUnitDevice.delete({
    where: { id: itemId },
    select: { packUnitId: true },
  });
  revalidatePath(`/pack-units/${item.packUnitId}`);
  revalidatePath("/material");
}

// ---------- PackUnit-Inhalt (Cable-Items) ----------

/**
 * Fügt ein Kabel einer Packeinheit hinzu (oder erhöht die Anzahl pro Case).
 * Analog zu addItemToPackUnit, aber für Kabel.
 */
export async function addCableToPackUnit(
  packUnitId: string,
  input: unknown
) {
  await requireRole(CAN_WRITE);
  const { packUnitCableItemSchema } = await import("@/lib/validators");
  const data = packUnitCableItemSchema.parse(input);

  await prisma.packUnitCable.upsert({
    where: {
      packUnitId_cableId: { packUnitId, cableId: data.cableId },
    },
    update: { quantity: data.quantity, notes: data.notes || null },
    create: {
      packUnitId,
      cableId: data.cableId,
      quantity: data.quantity,
      notes: data.notes || null,
    },
    select: { id: true },
  });
  revalidatePath(`/pack-units/${packUnitId}`);
  revalidatePath("/material");
}

export async function updateCableItemQuantity(itemId: string, quantity: number) {
  await requireRole(CAN_WRITE);
  if (quantity < 1) throw new Error("Anzahl muss mindestens 1 sein");
  const item = await prisma.packUnitCable.update({
    where: { id: itemId },
    data: { quantity },
    select: { packUnitId: true },
  });
  revalidatePath(`/pack-units/${item.packUnitId}`);
  revalidatePath("/material");
}

export async function removeCableFromPackUnit(itemId: string) {
  await requireRole(CAN_WRITE);
  const item = await prisma.packUnitCable.delete({
    where: { id: itemId },
    select: { packUnitId: true },
  });
  revalidatePath(`/pack-units/${item.packUnitId}`);
  revalidatePath("/material");
}
