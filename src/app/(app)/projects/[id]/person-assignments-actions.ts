"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { personAssignmentSchema } from "@/lib/validators";
import { Prisma, ServiceItemKind } from "@prisma/client";

/** Revalidiert Projekt-Seite, Kalender ("Meine Einsätze") + Public-Zeiterfassungsseite. */
function revalidateAssignment(projectId: string, personalToken: string | null) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/calendar");
  if (personalToken) revalidatePath(`/einsatz/${personalToken}`);
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

export async function addPersonAssignment(projectServiceId: string, input: unknown) {
  await requireRole(CAN_WRITE);
  const data = personAssignmentSchema.parse(input);

  const service = await prisma.projectService.findUnique({
    where: { id: projectServiceId },
    select: { projectId: true, serviceItem: { select: { kind: true } } },
  });
  if (!service) throw new Error("Position nicht gefunden");
  // Transport-Positionen tragen Fahrzeuge/Anhänger, kein Personal — wer fährt,
  // wird als Fahrer am Fahrzeug-Einsatz eingetragen (VehicleAssignment.driver).
  if (service.serviceItem.kind === ServiceItemKind.TRANSPORT) {
    throw new Error(
      "An Transport-Positionen wird kein Personal eingeplant — den Fahrer am Fahrzeug-Einsatz eintragen"
    );
  }

  const person = await prisma.person.findUnique({
    where: { id: data.personId },
    select: { employmentType: true, personalToken: true },
  });
  if (!person) throw new Error("Person nicht gefunden");

  const billingPeriodId = await validateAssignmentPeriod(
    service.projectId,
    data.billingPeriodId
  );

  // Vergütung ist ein Freelancer-Konzept — für alle anderen Arten
  // serverseitig verwerfen, damit keine versehentlichen Kosten entstehen.
  const isFreelancer = person.employmentType === "FREELANCER";
  const agreedRate =
    isFreelancer && data.agreedRate != null
      ? new Prisma.Decimal(data.agreedRate)
      : null;
  const hourlyRate =
    isFreelancer && data.hourlyRate != null
      ? new Prisma.Decimal(data.hourlyRate)
      : null;

  await prisma.personAssignment.create({
    data: {
      projectServiceId,
      projectId: service.projectId,
      personId: data.personId,
      billingPeriodId,
      plannedStart: data.plannedStart ?? null,
      plannedEnd: data.plannedEnd ?? null,
      agreedRate,
      hourlyRate,
      notes: data.notes || null,
    },
    select: { id: true },
  });
  revalidateAssignment(service.projectId, person.personalToken);
}

export async function updatePersonAssignment(id: string, input: unknown) {
  await requireRole(CAN_WRITE);
  const data = personAssignmentSchema.parse(input);

  const existing = await prisma.personAssignment.findUnique({
    where: { id },
    select: { projectId: true, personId: true },
  });
  if (!existing) throw new Error("Einsatz nicht gefunden");
  // Die Person eines Einsatzes ist fix — für eine andere Person den Einsatz
  // löschen und neu anlegen (hält Satz-/Zeit-Snapshots konsistent).
  if (data.personId !== existing.personId) {
    throw new Error("Person eines Einsatzes kann nicht geändert werden");
  }

  const person = await prisma.person.findUnique({
    where: { id: existing.personId },
    select: { employmentType: true, personalToken: true },
  });

  const billingPeriodId = await validateAssignmentPeriod(
    existing.projectId,
    data.billingPeriodId
  );

  const isFreelancer = person?.employmentType === "FREELANCER";
  await prisma.personAssignment.update({
    where: { id },
    data: {
      billingPeriodId,
      plannedStart: data.plannedStart ?? null,
      plannedEnd: data.plannedEnd ?? null,
      agreedRate:
        isFreelancer && data.agreedRate != null
          ? new Prisma.Decimal(data.agreedRate)
          : null,
      hourlyRate:
        isFreelancer && data.hourlyRate != null
          ? new Prisma.Decimal(data.hourlyRate)
          : null,
      notes: data.notes || null,
    },
    select: { id: true },
  });
  revalidateAssignment(existing.projectId, person?.personalToken ?? null);
}

/**
 * Nur der Satz (Inline-Input in der Tabelle, Freelancer). Je nach
 * Vergütungsart des Einsatzes wird Pauschale ODER Stundensatz gesetzt —
 * das jeweils andere Feld wird geleert (genau eines darf gesetzt sein).
 */
export async function updateAssignmentRate(
  id: string,
  rate: number | null,
  kind: "agreed" | "hourly"
) {
  await requireRole(CAN_WRITE);
  const existing = await prisma.personAssignment.findUnique({
    where: { id },
    select: { projectId: true, person: { select: { employmentType: true } } },
  });
  if (!existing) throw new Error("Einsatz nicht gefunden");
  if (existing.person.employmentType !== "FREELANCER") {
    throw new Error("Satz nur bei Freelancern");
  }
  const value = rate == null ? null : new Prisma.Decimal(rate);
  await prisma.personAssignment.update({
    where: { id },
    data:
      kind === "agreed"
        ? { agreedRate: value, hourlyRate: null }
        : { hourlyRate: value, agreedRate: null },
    select: { id: true },
  });
  revalidatePath(`/projects/${existing.projectId}`);
}

export async function setAssignmentInvoiceReceived(id: string, received: boolean) {
  await requireRole(CAN_WRITE);
  const updated = await prisma.personAssignment.update({
    where: { id },
    data: { invoiceReceived: received },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${updated.projectId}`);
}

export async function removePersonAssignment(id: string) {
  await requireRole(CAN_WRITE);
  const existing = await prisma.personAssignment.findUnique({
    where: { id },
    select: { projectId: true, person: { select: { personalToken: true } } },
  });
  if (!existing) return;
  // Erfasste Zeiten überleben per SetNull (Lohn-Beleg, siehe Schema).
  await prisma.personAssignment.delete({ where: { id } });
  revalidateAssignment(existing.projectId, existing.person.personalToken);
}
