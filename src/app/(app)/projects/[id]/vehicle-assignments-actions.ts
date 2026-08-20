"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { vehicleAssignmentSchema } from "@/lib/validators";
import { ServiceItemKind } from "@prisma/client";

/** Revalidiert Projekt-Seite und die Fuhrpark-Sichten der Einheit. */
function revalidateVehicleAssignment(projectId: string, vehicleId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/vehicles");
  revalidatePath(`/vehicles/${vehicleId}`);
}

/** Prüft, dass der Berechnungszeitraum zum Projekt gehört. */
async function validateAssignmentPeriod(
  projectId: string,
  billingPeriodId: string | null | undefined
): Promise<string | null> {
  if (!billingPeriodId) return null;
  const period = await prisma.billingPeriod.findUnique({
    where: { id: billingPeriodId },
    select: { projectId: true },
  });
  if (!period || period.projectId !== projectId) {
    throw new Error("Ungültiger Berechnungszeitraum");
  }
  return billingPeriodId;
}

/** Prüft, dass der Fahrer existiert und aktiv ist (optionales Feld). */
async function validateDriver(
  driverId: string | null | undefined
): Promise<string | null> {
  if (!driverId) return null;
  const person = await prisma.person.findUnique({
    where: { id: driverId },
    select: { id: true },
  });
  if (!person) throw new Error("Fahrer nicht gefunden");
  return person.id;
}

export async function addVehicleAssignment(projectServiceId: string, input: unknown) {
  await requireRole(CAN_WRITE);
  const data = vehicleAssignmentSchema.parse(input);

  const service = await prisma.projectService.findUnique({
    where: { id: projectServiceId },
    select: { projectId: true, serviceItem: { select: { kind: true } } },
  });
  if (!service) throw new Error("Position nicht gefunden");
  // Fahrzeuge/Anhänger gehören an Transport-Positionen — sonst landen sie in
  // Personal-Zeilen und der Einsatzplan wird unlesbar.
  if (service.serviceItem.kind !== ServiceItemKind.TRANSPORT) {
    throw new Error(
      "Fuhrpark-Einheiten können nur an Transport-Positionen eingeplant werden"
    );
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: data.vehicleId },
    select: { id: true },
  });
  if (!vehicle) throw new Error("Fuhrpark-Einheit nicht gefunden");

  const billingPeriodId = await validateAssignmentPeriod(
    service.projectId,
    data.billingPeriodId
  );
  const driverId = await validateDriver(data.driverId);

  await prisma.vehicleAssignment.create({
    data: {
      projectServiceId,
      projectId: service.projectId,
      vehicleId: data.vehicleId,
      billingPeriodId,
      plannedStart: data.plannedStart ?? null,
      plannedEnd: data.plannedEnd ?? null,
      driverId,
      notes: data.notes || null,
    },
    select: { id: true },
  });
  revalidateVehicleAssignment(service.projectId, data.vehicleId);
}

export async function updateVehicleAssignment(id: string, input: unknown) {
  await requireRole(CAN_WRITE);
  const data = vehicleAssignmentSchema.parse(input);

  const existing = await prisma.vehicleAssignment.findUnique({
    where: { id },
    select: { projectId: true, vehicleId: true },
  });
  if (!existing) throw new Error("Einsatz nicht gefunden");
  // Die Einheit eines Einsatzes ist fix — für eine andere Einheit den Einsatz
  // löschen und neu anlegen (Muster PersonAssignment).
  if (data.vehicleId !== existing.vehicleId) {
    throw new Error("Fuhrpark-Einheit eines Einsatzes kann nicht geändert werden");
  }

  const billingPeriodId = await validateAssignmentPeriod(
    existing.projectId,
    data.billingPeriodId
  );
  const driverId = await validateDriver(data.driverId);

  await prisma.vehicleAssignment.update({
    where: { id },
    data: {
      billingPeriodId,
      plannedStart: data.plannedStart ?? null,
      plannedEnd: data.plannedEnd ?? null,
      driverId,
      notes: data.notes || null,
    },
    select: { id: true },
  });
  revalidateVehicleAssignment(existing.projectId, existing.vehicleId);
}

export async function removeVehicleAssignment(id: string) {
  await requireRole(CAN_WRITE);
  const existing = await prisma.vehicleAssignment.findUnique({
    where: { id },
    select: { projectId: true, vehicleId: true },
  });
  if (!existing) return;
  await prisma.vehicleAssignment.delete({ where: { id } });
  revalidateVehicleAssignment(existing.projectId, existing.vehicleId);
}
