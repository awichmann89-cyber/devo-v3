"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_ADMIN } from "@/lib/auth-helpers";
import { categorySchema } from "@/lib/validators";

function normalize(input: unknown) {
  const data = categorySchema.parse(input);
  return {
    name: data.name.trim(),
    prefix: data.prefix ? data.prefix.toUpperCase() : null,
    parentId: data.parentId || null,
  };
}

export async function createCategory(input: unknown) {
  await requireRole(CAN_ADMIN);
  const data = normalize(input);
  await prisma.category.create({ data, select: { id: true } });
  revalidatePath("/settings");
  revalidatePath("/material");
}

export async function updateCategory(id: string, input: unknown) {
  await requireRole(CAN_ADMIN);
  const data = normalize(input);

  // Schutz vor Selbst-Referenz (würde Zyklus erzeugen)
  if (data.parentId === id) {
    throw new Error("Eine Kategorie kann nicht ihre eigene Unterkategorie sein");
  }

  // Schutz vor Zyklen über mehrere Ebenen
  if (data.parentId) {
    let cursor: string | null = data.parentId;
    const visited = new Set<string>([id]);
    while (cursor) {
      if (visited.has(cursor)) {
        throw new Error("Diese Zuordnung würde einen Zyklus erzeugen");
      }
      visited.add(cursor);
      const next: { parentId: string | null } | null = await prisma.category.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      cursor = next?.parentId ?? null;
    }
  }

  await prisma.category.update({
    where: { id },
    data,
    select: { id: true },
  });
  revalidatePath("/settings");
  revalidatePath("/material");
}

export async function deleteCategory(id: string) {
  await requireRole(CAN_ADMIN);
  const cat = await prisma.category.findUnique({
    where: { id },
    include: {
      _count: { select: { devices: true, packUnits: true, children: true } },
    },
  });
  if (!cat) throw new Error("Kategorie nicht gefunden");
  if (cat._count.devices > 0)
    throw new Error(`Kategorie hat noch ${cat._count.devices} zugeordnete(s) Gerät(e)`);
  if (cat._count.packUnits > 0)
    throw new Error(
      `Kategorie hat noch ${cat._count.packUnits} zugeordnete Packeinheit(en)`
    );
  if (cat._count.children > 0)
    throw new Error(
      `Kategorie hat noch ${cat._count.children} Unterkategorie(n). Diese zuerst löschen oder verschieben.`
    );

  await prisma.category.delete({ where: { id } });
  revalidatePath("/settings");
  revalidatePath("/material");
}
