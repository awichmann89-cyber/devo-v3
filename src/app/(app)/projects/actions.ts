"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { projectSchema, assignmentSchema } from "@/lib/validators";
import { findConflicts } from "@/lib/availability";
import { redirect } from "next/navigation";

export async function createProject(input: unknown) {
  const session = await requireRole(CAN_WRITE);
  const data = projectSchema.parse(input);
  const { billingPeriods, ...rest } = data;

  // Defensive: User aus dem Session-Token kann veraltet sein.
  const userExists = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });

  const created = await prisma.project.create({
    data: {
      ...rest,
      customerId: rest.customerId || null,
      description: rest.description || null,
      notes: rest.notes || null,
      createdById: userExists ? session.user.id : null,
      billingPeriods: {
        create: billingPeriods.map((p) => ({
          start: p.start,
          end: p.end,
          notes: p.notes || null,
        })),
      },
    },
    select: { id: true },
  });
  revalidatePath("/projects");
  redirect(`/projects/${created.id}`);
}

export async function updateProject(id: string, input: unknown) {
  await requireRole(CAN_WRITE);
  const data = projectSchema.parse(input);
  const { billingPeriods, ...rest } = data;

  // Strategy: Project-Felder updaten, Billing-Periods komplett neu setzen.
  // Einfacher als individuelle Diff-Logik und für moderate Mengen unkritisch.
  await prisma.$transaction([
    prisma.project.update({
      where: { id },
      data: {
        ...rest,
        customerId: rest.customerId || null,
        description: rest.description || null,
        notes: rest.notes || null,
      },
      select: { id: true },
    }),
    prisma.billingPeriod.deleteMany({ where: { projectId: id } }),
    prisma.billingPeriod.createMany({
      data: billingPeriods.map((p) => ({
        projectId: id,
        start: p.start,
        end: p.end,
        notes: p.notes || null,
      })),
    }),
  ]);
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
}

export async function deleteProject(id: string) {
  await requireRole(CAN_WRITE);
  await prisma.project.delete({ where: { id } });
  revalidatePath("/projects");
  redirect("/projects");
}

/**
 * Fügt eine Packeinheit einem Projekt hinzu. Gibt Konflikte zurück, falls vorhanden.
 * Bei force=true wird trotzdem hinzugefügt.
 */
export async function addAssignment(
  projectId: string,
  input: unknown,
  force = false
): Promise<{ ok: boolean; conflicts?: { projectName: string; planningStart: Date; planningEnd: Date }[] }> {
  await requireRole(CAN_WRITE);
  const data = assignmentSchema.parse(input);

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Projekt nicht gefunden");

  if (!force) {
    const conflicts = await findConflicts(
      [data.packUnitId],
      project.planningStart,
      project.planningEnd,
      projectId
    );
    if (conflicts.length > 0) {
      return {
        ok: false,
        conflicts: conflicts.map((c) => ({
          projectName: c.project.name,
          planningStart: c.project.planningStart,
          planningEnd: c.project.planningEnd,
        })),
      };
    }
  }

  await prisma.projectAssignment.upsert({
    where: { projectId_packUnitId: { projectId, packUnitId: data.packUnitId } },
    update: {
      quantity: data.quantity,
      groupId: data.groupId,
      notes: data.notes || null,
    },
    create: {
      projectId,
      packUnitId: data.packUnitId,
      groupId: data.groupId,
      quantity: data.quantity,
      notes: data.notes || null,
    },
  });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function updateAssignmentQuantity(
  projectId: string,
  assignmentId: string,
  quantity: number
) {
  await requireRole(CAN_WRITE);
  if (quantity < 1) throw new Error("Anzahl muss mindestens 1 sein");
  await prisma.projectAssignment.update({
    where: { id: assignmentId },
    data: { quantity },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function removeAssignment(projectId: string, assignmentId: string) {
  await requireRole(CAN_WRITE);
  await prisma.projectAssignment.delete({ where: { id: assignmentId } });
  revalidatePath(`/projects/${projectId}`);
}

export async function moveAssignmentToGroup(
  projectId: string,
  assignmentId: string,
  groupId: string
) {
  await requireRole(CAN_WRITE);
  await prisma.projectAssignment.update({
    where: { id: assignmentId },
    data: { groupId },
    select: { id: true },
  });
  revalidatePath(`/projects/${projectId}`);
}
