"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { locationSchema } from "@/lib/validators";
import { z } from "zod";

export async function createLocation(input: unknown) {
  await requireRole(CAN_WRITE);
  const data = locationSchema.parse(input);
  const created = await prisma.location.create({ data });
  revalidatePath("/locations");
  return created;
}

export async function updateLocation(id: string, input: unknown) {
  await requireRole(CAN_WRITE);
  const data = locationSchema.parse(input);
  const updated = await prisma.location.update({ where: { id }, data });
  revalidatePath("/locations");
  return updated;
}

export async function deleteLocation(id: string) {
  await requireRole(CAN_WRITE);
  z.string().min(1).parse(id);
  await prisma.location.delete({ where: { id } });
  revalidatePath("/locations");
}
