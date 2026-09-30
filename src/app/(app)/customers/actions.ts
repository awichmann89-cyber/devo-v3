"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { customerSchema, customerNameLineSchema } from "@/lib/validators";

function normalize(input: unknown) {
  const data = customerSchema.parse(input);
  return {
    name: data.name.trim(),
    contactPerson: data.contactPerson?.trim() || null,
    email: data.email?.trim() || null,
    phone: data.phone?.trim() || null,
    address: data.address?.trim() || null,
    nameLines: data.nameLines,
    notes: data.notes?.trim() || null,
  };
}

/** Wirft eine sprechende Fehlermeldung bei Unique-Verletzungen auf `name`. */
function rethrowUniqueNameError(e: unknown): never {
  if (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === "P2002" &&
    Array.isArray(e.meta?.target) &&
    e.meta.target.includes("name")
  ) {
    throw new Error("Ein Kunde mit diesem Namen existiert bereits.");
  }
  throw e;
}

export async function createCustomer(
  input: unknown
): Promise<{ id: string; name: string; address: string | null }> {
  await requireRole(CAN_WRITE);
  const data = normalize(input);
  try {
    const created = await prisma.customer.create({
      data,
      select: { id: true, name: true, address: true },
    });
    revalidatePath("/customers");
    revalidatePath("/projects");
    return created;
  } catch (e) {
    rethrowUniqueNameError(e);
  }
}

export async function updateCustomer(id: string, input: unknown) {
  await requireRole(CAN_WRITE);
  const data = normalize(input);
  try {
    await prisma.customer.update({
      where: { id },
      data,
      select: { id: true },
    });
    revalidatePath("/customers");
    revalidatePath("/projects");
  } catch (e) {
    rethrowUniqueNameError(e);
  }
}

export async function deleteCustomer(id: string) {
  await requireRole(CAN_WRITE);
  const c = await prisma.customer.findUnique({
    where: { id },
    include: { _count: { select: { projects: true } } },
  });
  if (!c) throw new Error("Kunde nicht gefunden");
  if (c._count.projects > 0) {
    throw new Error(
      `Kunde hat noch ${c._count.projects} Projekt(e). Erst dort den Kunden entfernen.`
    );
  }
  await prisma.customer.delete({ where: { id } });
  revalidatePath("/customers");
}

/**
 * Hängt eine zweite Namenszeile an die Auswahlliste des Kunden an — für
 * „+ Neue Zeile…" im Projekt, ohne den Umweg über die Kundenverwaltung.
 * Existiert die Zeile bereits, bleibt die Liste unverändert.
 */
export async function addCustomerNameLine(
  customerId: string,
  input: unknown
): Promise<string[]> {
  await requireRole(CAN_WRITE);
  const line = customerNameLineSchema.parse(input);
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { nameLines: true },
  });
  if (!c) throw new Error("Kunde nicht gefunden");
  if (c.nameLines.includes(line)) return c.nameLines;
  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: { nameLines: { push: line } },
    select: { nameLines: true },
  });
  revalidatePath("/customers");
  revalidatePath("/projects");
  return updated.nameLines;
}
