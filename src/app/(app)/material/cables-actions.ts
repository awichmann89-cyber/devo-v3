"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import {
  cableSchema,
  cableUnitSchema,
  inspectionSchema,
} from "@/lib/validators";
import { Prisma } from "@prisma/client";

export async function createCable(input: unknown) {
  await requireRole(CAN_WRITE);
  const data = cableSchema.parse(input);

  await prisma.cable.create({
    data: {
      name: data.name.trim(),
      description: data.description || null,
      cableType: data.cableType || null,
      lengthMeters: data.lengthMeters
        ? new Prisma.Decimal(data.lengthMeters)
        : null,
      connectorA: data.connectorA || null,
      connectorB: data.connectorB || null,
      stockQuantity: data.stockQuantity,
      replacementValue: data.replacementValue
        ? new Prisma.Decimal(data.replacementValue)
        : null,
      weight: data.weight ? new Prisma.Decimal(data.weight) : null,
      inspectionExempt: data.inspectionExempt,
      categoryId: data.categoryId || null,
      units: {
        create: Array.from({ length: data.stockQuantity }, () => ({})),
      },
    },
    select: { id: true },
  });

  revalidatePath("/material");
}

export async function updateCable(id: string, input: unknown) {
  await requireRole(CAN_WRITE);
  const data = cableSchema.parse(input);

  const current = await prisma.cable.findUnique({
    where: { id },
    include: {
      units: {
        include: { _count: { select: { inspections: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!current) throw new Error("Kabel nicht gefunden");

  const targetCount = data.stockQuantity;
  const currentCount = current.units.length;

  await prisma.cable.update({
    where: { id },
    data: {
      name: data.name.trim(),
      description: data.description || null,
      cableType: data.cableType || null,
      lengthMeters: data.lengthMeters
        ? new Prisma.Decimal(data.lengthMeters)
        : null,
      connectorA: data.connectorA || null,
      connectorB: data.connectorB || null,
      stockQuantity: targetCount,
      replacementValue: data.replacementValue
        ? new Prisma.Decimal(data.replacementValue)
        : null,
      weight: data.weight ? new Prisma.Decimal(data.weight) : null,
      inspectionExempt: data.inspectionExempt,
      categoryId: data.categoryId || null,
    },
    select: { id: true },
  });

  if (targetCount > currentCount) {
    const toAdd = targetCount - currentCount;
    await prisma.cableUnit.createMany({
      data: Array.from({ length: toAdd }, () => ({ cableId: id })),
    });
  } else if (targetCount < currentCount) {
    const toRemove = currentCount - targetCount;
    const removable = current.units
      .filter((u) => !u.barcode && u._count.inspections === 0)
      .slice(-toRemove);
    if (removable.length < toRemove) {
      throw new Error(
        `Bestand kann nicht reduziert werden — ${toRemove - removable.length} Einheiten haben bereits Barcode oder Prüfungen.`
      );
    }
    await prisma.cableUnit.deleteMany({
      where: { id: { in: removable.map((u) => u.id) } },
    });
  }

  revalidatePath("/material");
}

export async function deleteCable(id: string) {
  await requireRole(CAN_WRITE);
  const used = await prisma.projectCableAssignment.count({ where: { cableId: id } });
  if (used > 0) {
    throw new Error(
      `Kabel ist in ${used} Projekt(en) gebucht und kann nicht gelöscht werden.`
    );
  }
  await prisma.cable.delete({ where: { id } });
  revalidatePath("/material");
}

export async function updateCableUnit(id: string, input: unknown) {
  await requireRole(CAN_WRITE);
  const data = cableUnitSchema.parse(input);
  try {
    await prisma.cableUnit.update({
      where: { id },
      data: {
        barcode: data.barcode?.trim() || null,
        notes: data.notes || null,
      },
      select: { id: true },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new Error("Dieser Barcode ist bereits vergeben.");
    }
    throw err;
  }
  revalidatePath("/material");
}

export async function createInspection(
  target: { kind: "CABLE_UNIT" | "DEVICE_SERIAL"; id: string },
  input: unknown
) {
  await requireRole(CAN_WRITE);
  const data = inspectionSchema.parse(input);

  await prisma.inspection.create({
    data: {
      date: data.date,
      result: data.result,
      testerName: data.testerName || null,
      notes: data.notes || null,
      cableUnitId: target.kind === "CABLE_UNIT" ? target.id : null,
      deviceSerialId: target.kind === "DEVICE_SERIAL" ? target.id : null,
    },
    select: { id: true },
  });

  revalidatePath("/material");
  revalidatePath("/material/inspection");
}

export async function findInspectionTarget(scanned: string) {
  await requireRole(CAN_WRITE);
  const q = scanned.trim();
  if (!q) throw new Error("Bitte Barcode/Seriennummer eingeben.");

  // 1) Kabel-Einheit per Barcode
  const cableUnit = await prisma.cableUnit.findUnique({
    where: { barcode: q },
    include: {
      cable: true,
      inspections: { orderBy: { date: "desc" }, take: 5 },
    },
  });
  if (cableUnit) {
    return {
      kind: "CABLE_UNIT" as const,
      id: cableUnit.id,
      label: cableUnit.cable.name,
      subLabel: [
        cableUnit.cable.cableType,
        cableUnit.cable.lengthMeters ? `${cableUnit.cable.lengthMeters} m` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      barcode: cableUnit.barcode,
      inspectionExempt: cableUnit.cable.inspectionExempt,
      inspections: cableUnit.inspections.map((i) => ({
        id: i.id,
        date: i.date.toISOString(),
        result: i.result,
        testerName: i.testerName,
        notes: i.notes,
      })),
    };
  }

  // 2) Geräte: zuerst per Barcode (eindeutig), dann per Seriennummer
  const deviceSerial =
    (await prisma.deviceSerialNumber.findUnique({
      where: { barcode: q },
      include: {
        device: true,
        inspections: { orderBy: { date: "desc" }, take: 5 },
      },
    })) ??
    (await prisma.deviceSerialNumber.findFirst({
      where: { serialNumber: q },
      include: {
        device: true,
        inspections: { orderBy: { date: "desc" }, take: 5 },
      },
    }));
  if (deviceSerial) {
    return {
      kind: "DEVICE_SERIAL" as const,
      id: deviceSerial.id,
      label: deviceSerial.device.name,
      subLabel: [
        deviceSerial.device.manufacturer,
        deviceSerial.device.model,
        `S/N: ${deviceSerial.serialNumber}`,
      ]
        .filter(Boolean)
        .join(" · "),
      barcode: deviceSerial.barcode ?? deviceSerial.serialNumber,
      inspectionExempt: deviceSerial.device.inspectionExempt,
      inspections: deviceSerial.inspections.map((i) => ({
        id: i.id,
        date: i.date.toISOString(),
        result: i.result,
        testerName: i.testerName,
        notes: i.notes,
      })),
    };
  }

  return null;
}
