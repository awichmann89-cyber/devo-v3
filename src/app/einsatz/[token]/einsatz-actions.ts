"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { timeEntrySchema } from "@/lib/validators";
import { clockToMinutes } from "@/lib/personnel-costs";
import { Prisma } from "@prisma/client";

// Self-Service-Zeiterfassung vom Public-Endpoint aus.
// KEIN requireRole — Auth erfolgt rein über den Personen-Token (Muster
// submitScanWithToken). Jede Action prüft, dass das bearbeitete Objekt zur
// Token-Person gehört.

async function personByToken(token: string) {
  if (!token) return null;
  return prisma.person.findFirst({
    where: { personalToken: token, active: true },
    select: { id: true, employmentType: true, hourlyWage: true },
  });
}

function revalidateTimeEntry(token: string, personId: string, projectId: string) {
  revalidatePath(`/einsatz/${token}`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/persons/${personId}`);
}

export async function addTimeEntryWithToken(
  token: string,
  assignmentId: string,
  input: unknown
): Promise<{ ok: boolean; error?: string }> {
  const person = await personByToken(token);
  if (!person) return { ok: false, error: "Ungültiger Link" };

  const assignment = await prisma.personAssignment.findUnique({
    where: { id: assignmentId },
    select: { personId: true, projectId: true, hourlyRate: true },
  });
  if (!assignment || assignment.personId !== person.id) {
    return { ok: false, error: "Einsatz nicht gefunden" };
  }

  const parsed = timeEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Ungültige Eingabe" };
  }
  const data = parsed.data;

  // Lohn-Snapshot: Stundensatz des Einsatzes (Freelancer nach Stunden)
  // vor dem Minijobber-Stundenlohn — sonst kein Kosteneffekt (D4).
  const snapshot =
    assignment.hourlyRate !== null
      ? assignment.hourlyRate
      : person.employmentType === "MINIJOBBER" && person.hourlyWage !== null
        ? new Prisma.Decimal(person.hourlyWage)
        : null;

  await prisma.timeEntry.create({
    data: {
      personId: person.id,
      projectId: assignment.projectId,
      assignmentId,
      workDate: data.workDate,
      startMinute: clockToMinutes(data.start),
      endMinute: clockToMinutes(data.end),
      breakMinutes: data.breakMinutes,
      hourlyWageSnapshot: snapshot,
      notes: data.notes || null,
    },
    select: { id: true },
  });
  revalidateTimeEntry(token, person.id, assignment.projectId);
  return { ok: true };
}

export async function updateTimeEntryWithToken(
  token: string,
  entryId: string,
  input: unknown
): Promise<{ ok: boolean; error?: string }> {
  const person = await personByToken(token);
  if (!person) return { ok: false, error: "Ungültiger Link" };

  const entry = await prisma.timeEntry.findUnique({
    where: { id: entryId },
    select: { personId: true, projectId: true },
  });
  if (!entry || entry.personId !== person.id) {
    return { ok: false, error: "Eintrag nicht gefunden" };
  }

  const parsed = timeEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Ungültige Eingabe" };
  }
  const data = parsed.data;

  // Snapshot wird bei Self-Service-Korrekturen bewusst NICHT neu gezogen —
  // Lohnänderungen wirken nur auf neue Einträge (Korrektur nur durchs Büro).
  await prisma.timeEntry.update({
    where: { id: entryId },
    data: {
      workDate: data.workDate,
      startMinute: clockToMinutes(data.start),
      endMinute: clockToMinutes(data.end),
      breakMinutes: data.breakMinutes,
      notes: data.notes || null,
    },
    select: { id: true },
  });
  revalidateTimeEntry(token, person.id, entry.projectId);
  return { ok: true };
}

export async function deleteTimeEntryWithToken(
  token: string,
  entryId: string
): Promise<{ ok: boolean; error?: string }> {
  const person = await personByToken(token);
  if (!person) return { ok: false, error: "Ungültiger Link" };

  const entry = await prisma.timeEntry.findUnique({
    where: { id: entryId },
    select: { personId: true, projectId: true },
  });
  if (!entry || entry.personId !== person.id) {
    return { ok: false, error: "Eintrag nicht gefunden" };
  }

  await prisma.timeEntry.delete({ where: { id: entryId } });
  revalidateTimeEntry(token, person.id, entry.projectId);
  return { ok: true };
}
