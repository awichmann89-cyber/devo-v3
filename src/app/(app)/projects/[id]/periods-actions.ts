"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { projectPeriodsSchema } from "@/lib/validators";

export async function updateProjectPeriods(id: string, input: unknown) {
  await requireRole(CAN_WRITE);
  const data = projectPeriodsSchema.parse(input);

  // Diff-Update statt deleteMany+createMany: bestehende Zeiträume werden per
  // id aktualisiert, damit Personal-Einsätze (billingPeriodId, SetNull) und
  // Gruppen-Zuordnungen (M:N, Cascade) ihre Verknüpfung behalten. Nur
  // tatsächlich entfernte Zeiträume werden gelöscht.
  const existing = await prisma.billingPeriod.findMany({
    where: { projectId: id },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((e) => e.id));
  const keptIds = data.billingPeriods
    .map((p) => p.id)
    .filter((pid): pid is string => !!pid && existingIds.has(pid));

  await prisma.$transaction([
    prisma.project.update({
      where: { id },
      data: {
        planningStart: data.planningStart,
        planningEnd: data.planningEnd,
      },
      select: { id: true },
    }),
    prisma.billingPeriod.deleteMany({
      where: { projectId: id, id: { notIn: keptIds } },
    }),
    ...data.billingPeriods.map((p) =>
      p.id && existingIds.has(p.id)
        ? prisma.billingPeriod.update({
            where: { id: p.id },
            data: { start: p.start, end: p.end, notes: p.notes || null },
            select: { id: true },
          })
        : prisma.billingPeriod.create({
            data: {
              projectId: id,
              start: p.start,
              end: p.end,
              notes: p.notes || null,
            },
            select: { id: true },
          })
    ),
  ]);

  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
  revalidatePath("/calendar");
}
