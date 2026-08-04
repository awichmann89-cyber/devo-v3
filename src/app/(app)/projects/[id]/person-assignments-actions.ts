"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { personAssignmentSchema } from "@/lib/validators";
import { Prisma } from "@prisma/client";

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
    select: { projectId: true },
  });
  if (!service) throw new Error("Position nicht gefunden");

  const person = await prisma.person.findUnique({
    where: { id: data.personId },
    select: { employmentType: true, personalToken: true },
  });
  if (!person) throw new Error("Person nicht gefunden");

  const billingPeriodId = await validateAssignmentPeriod(
    service.projectId,
    data.billingPeriodId
  );

  // Vereinbarter Satz ist ein Freelancer-Konzept — für alle anderen Arten
  // serverseitig verwerfen, damit keine versehentlichen Kosten entstehen.
  const agreedRate =
    person.employmentType === "FREELANCER" && data.agreedRate != null
      ? new Prisma.Decimal(data.agreedRate)
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

  await prisma.personAssignment.update({
    where: { id },
    data: {
      billingPeriodId,
      plannedStart: data.plannedStart ?? null,
      plannedEnd: data.plannedEnd ?? null,
      agreedRate:
        person?.employmentType === "FREELANCER" && data.agreedRate != null
          ? new Prisma.Decimal(data.agreedRate)
          : null,
      notes: data.notes || null,
    },
    select: { id: true },
  });
  revalidateAssignment(existing.projectId, person?.personalToken ?? null);
}

/** Nur der vereinbarte Satz (Inline-Input in der Tabelle, Freelancer). */
export async function updateAssignmentAgreedRate(id: string, agreedRate: number | null) {
  await requireRole(CAN_WRITE);
  const existing = await prisma.personAssignment.findUnique({
    where: { id },
    select: { projectId: true, person: { select: { employmentType: true } } },
  });
  if (!existing) throw new Error("Einsatz nicht gefunden");
  if (existing.person.employmentType !== "FREELANCER") {
    throw new Error("Satz nur bei Freelancern");
  }
  await prisma.personAssignment.update({
    where: { id },
    data: {
      agreedRate: agreedRate == null ? null : new Prisma.Decimal(agreedRate),
    },
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
