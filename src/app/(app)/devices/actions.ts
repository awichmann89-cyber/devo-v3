"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { deviceSchema, serialNumberSchema } from "@/lib/validators";
import { generateShortId } from "@/lib/qr-code";

function normalize(input: unknown) {
  const data = deviceSchema.parse(input);
  return {
    ...data,
    categoryId: data.categoryId || null,
    replacementValue: data.replacementValue ?? null,
    weight: data.weight ?? null,
    powerWatts: data.powerWatts ?? null,
    manufacturer: data.manufacturer || null,
    model: data.model || null,
    description: data.description || null,
  };
}

export async function createDevice(input: unknown) {
  await requireRole(CAN_WRITE);
  const data = normalize(input);
  // shortId für den QR-Code mitvergeben — Unique-Constraint auf DB-Ebene
  // fängt Kollisionen ab. Bei einer 36^8-Permutationsbasis ist die
  // Wahrscheinlichkeit extrem niedrig, aber falls doch: einmal retry.
  await createWithUniqueShortId(() =>
    prisma.device.create({
      data: { ...data, shortId: generateShortId() },
      select: { id: true },
    }),
  );

  revalidatePath("/material");
}

/**
 * Helper für Create-Operationen mit einem auto-generierten shortId-Feld:
 * wiederholt den Aufruf bei Unique-Constraint-Verletzung (P2002) ein paar Mal
 * mit neuer ID. In der Praxis sollte das nie passieren.
 */
async function createWithUniqueShortId<T>(
  attempt: () => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await attempt();
    } catch (err) {
      lastErr = err;
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        Array.isArray(err.meta?.target) &&
        (err.meta.target as string[]).includes("shortId")
      ) {
        // Kollision — der Caller generiert beim nächsten Versuch automatisch
        // eine neue ID (generateShortId() läuft im Closure jeder Iteration).
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function updateDevice(id: string, input: unknown) {
  await requireRole(CAN_WRITE);
  const data = normalize(input);
  await prisma.device.update({ where: { id }, data, select: { id: true } });

  revalidatePath("/material");
  revalidatePath(`/devices/${id}`);
}

export async function deleteDevice(id: string) {
  await requireRole(CAN_WRITE);
  await prisma.device.delete({ where: { id } });
  revalidatePath("/material");
}

// ---------- Seriennummern ----------

export async function addSerialNumber(deviceId: string, input: unknown) {
  await requireRole(CAN_WRITE);
  const data = serialNumberSchema.parse(input);
  try {
    await prisma.deviceSerialNumber.create({
      data: {
        deviceId,
        serialNumber: data.serialNumber.trim(),
        barcode: data.barcode?.trim() ? data.barcode.trim() : null,
        notes: data.notes || null,
      },
      select: { id: true },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("Barcode oder Seriennummer existiert bereits.");
    }
    throw e;
  }
  revalidatePath(`/devices/${deviceId}`);
  revalidatePath("/material/inspection");
}

export async function updateSerialNumber(serialId: string, input: unknown) {
  await requireRole(CAN_WRITE);
  const data = serialNumberSchema.parse(input);
  try {
    const existing = await prisma.deviceSerialNumber.update({
      where: { id: serialId },
      data: {
        serialNumber: data.serialNumber.trim(),
        barcode: data.barcode?.trim() ? data.barcode.trim() : null,
        notes: data.notes || null,
      },
      select: { deviceId: true },
    });
    revalidatePath(`/devices/${existing.deviceId}`);
    revalidatePath("/material/inspection");
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("Barcode oder Seriennummer existiert bereits.");
    }
    throw e;
  }
}

export async function deleteSerialNumber(serialId: string) {
  await requireRole(CAN_WRITE);
  const existing = await prisma.deviceSerialNumber.delete({
    where: { id: serialId },
    select: { deviceId: true },
  });
  revalidatePath(`/devices/${existing.deviceId}`);
}
