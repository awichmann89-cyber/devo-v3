"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { projectPeriodsSchema } from "@/lib/validators";

export async function updateProjectPeriods(id: string, input: unknown) {
  await requireRole(CAN_WRITE);
  const data = projectPeriodsSchema.parse(input);

  await prisma.$transaction([
    prisma.project.update({
      where: { id },
      data: {
        planningStart: data.planningStart,
        planningEnd: data.planningEnd,
      },
      select: { id: true },
    }),
    prisma.billingPeriod.deleteMany({ where: { projectId: id } }),
    prisma.billingPeriod.createMany({
      data: data.billingPeriods.map((p) => ({
        projectId: id,
        start: p.start,
        end: p.end,
        notes: p.notes || null,
      })),
    }),
  ]);

  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
}
