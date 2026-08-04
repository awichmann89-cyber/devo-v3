"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { timeEntrySchema } from "@/lib/validators";
import { clockToMinutes } from "@/lib/personnel-costs";
import { Prisma } from "@prisma/client";
import { z } from "zod";

// Office-Zeiterfassung (Admin/Disponent) auf der Personen-Detailseite.
// Anders als die Self-Service-Actions darf das Büro auch den Lohn-Snapshot
// korrigieren (z.B. bei nachträglichen Lohnvereinbarungen).

const officeTimeEntrySchema = z.object({
  projectId: z.string().min(1, "Projekt erforderlich"),
  hourlyWageSnapshot: z.coerce.number().min(0).optional().nullable(),
});

function revalidateAll(personId: string, projectId: string, token: string | null) {
  revalidatePath(`/persons/${personId}`);
  revalidatePath(`/projects/${projectId}`);
  if (token) revalidatePath(`/einsatz/${token}`);
}

export async function addTimeEntryForPerson(personId: string, input: unknown) {
  await requireRole(CAN_WRITE);
  const data = timeEntrySchema.parse(input);
  const extra = officeTimeEntrySchema.parse(input);

  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { employmentType: true, hourlyWage: true, personalToken: true },
  });
  if (!person) throw new Error("Person nicht gefunden");

  // Snapshot: expliziter Office-Wert > Stammdaten-Lohn (nur Minijobber) > null.
  const snapshot =
    extra.hourlyWageSnapshot != null
      ? new Prisma.Decimal(extra.hourlyWageSnapshot)
      : person.employmentType === "MINIJOBBER" && person.hourlyWage !== null
        ? new Prisma.Decimal(person.hourlyWage)
        : null;

  await prisma.timeEntry.create({
    data: {
      personId,
      projectId: extra.projectId,
      workDate: data.workDate,
      startMinute: clockToMinutes(data.start),
      endMinute: clockToMinutes(data.end),
      breakMinutes: data.breakMinutes,
      hourlyWageSnapshot: snapshot,
      notes: data.notes || null,
    },
    select: { id: true },
  });
  revalidateAll(personId, extra.projectId, person.personalToken);
}

export async function updateTimeEntry(id: string, input: unknown) {
  await requireRole(CAN_WRITE);
  const data = timeEntrySchema.parse(input);
  const extra = officeTimeEntrySchema.partial({ projectId: true }).parse(input);

  const entry = await prisma.timeEntry.findUnique({
    where: { id },
    select: {
      personId: true,
      projectId: true,
      person: { select: { personalToken: true } },
    },
  });
  if (!entry) throw new Error("Eintrag nicht gefunden");

  await prisma.timeEntry.update({
    where: { id },
    data: {
      workDate: data.workDate,
      startMinute: clockToMinutes(data.start),
      endMinute: clockToMinutes(data.end),
      breakMinutes: data.breakMinutes,
      hourlyWageSnapshot:
        extra.hourlyWageSnapshot === undefined
          ? undefined
          : extra.hourlyWageSnapshot === null
            ? null
            : new Prisma.Decimal(extra.hourlyWageSnapshot),
      notes: data.notes || null,
    },
    select: { id: true },
  });
  revalidateAll(entry.personId, entry.projectId, entry.person.personalToken);
}

export async function deleteTimeEntry(id: string) {
  await requireRole(CAN_WRITE);
  const entry = await prisma.timeEntry.findUnique({
    where: { id },
    select: {
      personId: true,
      projectId: true,
      person: { select: { personalToken: true } },
    },
  });
  if (!entry) return;
  await prisma.timeEntry.delete({ where: { id } });
  revalidateAll(entry.personId, entry.projectId, entry.person.personalToken);
}
