"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_ADMIN } from "@/lib/auth-helpers";
import { userSchema } from "@/lib/validators";
import bcrypt from "bcryptjs";

export async function createUser(input: unknown) {
  await requireRole(CAN_ADMIN);
  const data = userSchema.parse(input);
  if (!data.password) throw new Error("Passwort erforderlich");
  const passwordHash = await bcrypt.hash(data.password, 10);
  const created = await prisma.user.create({
    data: {
      email: data.email,
      name: data.name || null,
      passwordHash,
      role: data.role,
    },
  });
  revalidatePath("/users");
  return created;
}

export async function updateUser(id: string, input: unknown) {
  await requireRole(CAN_ADMIN);
  const data = userSchema.parse(input);
  const updateData: {
    email: string;
    name: string | null;
    role: typeof data.role;
    passwordHash?: string;
  } = {
    email: data.email,
    name: data.name || null,
    role: data.role,
  };
  if (data.password && data.password.length > 0) {
    updateData.passwordHash = await bcrypt.hash(data.password, 10);
  }
  const updated = await prisma.user.update({ where: { id }, data: updateData });
  revalidatePath("/users");
  return updated;
}

export async function deleteUser(id: string) {
  await requireRole(CAN_ADMIN);
  await prisma.user.delete({ where: { id } });
  revalidatePath("/users");
}
