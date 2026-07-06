"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { nextSortOrderForGroup } from "@/lib/project-sort-order";
import { subhireSchema, extraCostSchema } from "@/lib/validators";

type SubhireInput = z.input<typeof subhireSchema>;
type ExtraCostInput = z.input<typeof extraCostSchema>;

/**
 * Normalisiert optionale FK-Strings: leere Strings/undefined → null, damit
 * Prisma sie sauber als "keine Verknüpfung" speichert.
 */
function nullable(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s ? s : null;
}

// ---------------------------------------------------------------------------
// Zumietungen (ProjectSubhire) — rein interne Kostenpositionen
// ---------------------------------------------------------------------------

export async function addSubhire(projectId: string, input: SubhireInput) {
  await requireRole(CAN_WRITE);
  const data = subhireSchema.parse(input);
  const groupId = nullable(data.groupId);

  // Freie (mit Gruppe verknüpfte, aber nicht geräte-gebundene) Zumietungen
  // erscheinen als eigene Zeile in der Gruppe — daher ans Ende einsortieren.
  const sortOrder = groupId
    ? await nextSortOrderForGroup(projectId, groupId)
    : 0;

  await prisma.projectSubhire.create({
    data: {
      projectId,
      deviceId: nullable(data.deviceId),
      groupId,
      name: data.name.trim(),
      supplier: nullable(data.supplier),
      quantity: data.quantity,
      unitCost: new Prisma.Decimal(data.unitCost),
      notes: nullable(data.notes),
      sortOrder,
    },
    select: { id: true },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function updateSubhire(subhireId: string, input: SubhireInput) {
  await requireRole(CAN_WRITE);
  const data = subhireSchema.parse(input);
  const updated = await prisma.projectSubhire.update({
    where: { id: subhireId },
    data: {
      deviceId: nullable(data.deviceId),
      groupId: nullable(data.groupId),
      name: data.name.trim(),
      supplier: nullable(data.supplier),
      quantity: data.quantity,
      unitCost: new Prisma.Decimal(data.unitCost),
      notes: nullable(data.notes),
    },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${updated.projectId}`);
}

export async function removeSubhire(subhireId: string) {
  await requireRole(CAN_WRITE);
  const removed = await prisma.projectSubhire.delete({
    where: { id: subhireId },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${removed.projectId}`);
}

// ---------------------------------------------------------------------------
// Extrakosten (ProjectExtraCost) — sonstige / personaltechnische Kosten
// ---------------------------------------------------------------------------

export async function addExtraCost(projectId: string, input: ExtraCostInput) {
  await requireRole(CAN_WRITE);
  const data = extraCostSchema.parse(input);

  const last = await prisma.projectExtraCost.findFirst({
    where: { projectId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.projectExtraCost.create({
    data: {
      projectId,
      label: data.label.trim(),
      kind: data.kind,
      amount: new Prisma.Decimal(data.amount),
      notes: nullable(data.notes),
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
    select: { id: true },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function updateExtraCost(costId: string, input: ExtraCostInput) {
  await requireRole(CAN_WRITE);
  const data = extraCostSchema.parse(input);
  const updated = await prisma.projectExtraCost.update({
    where: { id: costId },
    data: {
      label: data.label.trim(),
      kind: data.kind,
      amount: new Prisma.Decimal(data.amount),
      notes: nullable(data.notes),
    },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${updated.projectId}`);
}

export async function removeExtraCost(costId: string) {
  await requireRole(CAN_WRITE);
  const removed = await prisma.projectExtraCost.delete({
    where: { id: costId },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${removed.projectId}`);
}
