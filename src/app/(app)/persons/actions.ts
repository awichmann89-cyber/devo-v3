"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { personSchema } from "@/lib/validators";
import { Prisma } from "@prisma/client";

export async function createPerson(input: unknown) {
  await requireRole(CAN_WRITE);
  const data = personSchema.parse(input);
  try {
    const created = await prisma.person.create({
      data: {
        name: data.name.trim(),
        employmentType: data.employmentType,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        notes: data.notes || null,
        active: data.active,
        hourlyWage: data.hourlyWage ?? null,
        defaultDayRate: data.defaultDayRate ?? null,
      },
      select: { id: true },
    });
    revalidatePath("/persons");
    return created;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error("Eine Person mit diesem Namen existiert bereits.");
    }
    throw err;
  }
}

export async function updatePerson(id: string, input: unknown) {
  await requireRole(CAN_WRITE);
  const data = personSchema.parse(input);
  try {
    await prisma.person.update({
      where: { id },
      data: {
        name: data.name.trim(),
        employmentType: data.employmentType,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        notes: data.notes || null,
        active: data.active,
        hourlyWage: data.hourlyWage ?? null,
        defaultDayRate: data.defaultDayRate ?? null,
      },
      select: { id: true },
    });
    revalidatePath("/persons");
    revalidatePath(`/persons/${id}`);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error("Eine Person mit diesem Namen existiert bereits.");
    }
    throw err;
  }
}

export async function deletePerson(id: string) {
  await requireRole(CAN_WRITE);
  // Personen mit Einsätzen oder erfassten Zeiten nur deaktivieren —
  // Historie (Lohn-Belege!) bleibt erhalten. Restrict-FKs sind der DB-Backstop.
  const [assignmentCount, timeEntryCount] = await Promise.all([
    prisma.personAssignment.count({ where: { personId: id } }),
    prisma.timeEntry.count({ where: { personId: id } }),
  ]);
  if (assignmentCount + timeEntryCount > 0) {
    await prisma.person.update({
      where: { id },
      data: { active: false },
      select: { id: true },
    });
    revalidatePath("/persons");
    return { deactivated: true };
  }
  await prisma.person.delete({ where: { id } });
  revalidatePath("/persons");
  return { deactivated: false };
}

export async function togglePersonActive(id: string, active: boolean) {
  await requireRole(CAN_WRITE);
  await prisma.person.update({
    where: { id },
    data: { active },
    select: { id: true },
  });
  revalidatePath("/persons");
  revalidatePath(`/persons/${id}`);
}

/**
 * Erzeugt oder liefert den persönlichen Token einer Person. Er speist BEIDE
 * Public-URLs: den ICS-Feed (/api/calendar/person.ics?token=…) und die
 * Zeiterfassungs-Seite (/einsatz/[token]). Lazy wie Project.packToken.
 */
export async function getOrCreatePersonToken(personId: string): Promise<string> {
  await requireRole(CAN_WRITE);
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { personalToken: true },
  });
  if (!person) throw new Error("Person nicht gefunden");
  if (person.personalToken) return person.personalToken;

  const fresh = crypto.randomUUID().replace(/-/g, "");
  await prisma.person.update({
    where: { id: personId },
    data: { personalToken: fresh },
  });
  return fresh;
}

/**
 * Erzeugt einen neuen Token (z.B. wenn der Link rumgereicht wurde).
 * Achtung: invalidiert Kalender-Abo UND Zeiterfassungs-Link gleichzeitig.
 */
export async function regeneratePersonToken(personId: string): Promise<string> {
  await requireRole(CAN_WRITE);
  const fresh = crypto.randomUUID().replace(/-/g, "");
  await prisma.person.update({
    where: { id: personId },
    data: { personalToken: fresh },
  });
  revalidatePath(`/persons/${personId}`);
  return fresh;
}
