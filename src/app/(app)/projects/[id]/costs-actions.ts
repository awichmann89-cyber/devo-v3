"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import {
  nextSortOrderForGroup,
  nextCostSortOrderForGroup,
} from "@/lib/project-sort-order";
import { subhireSchema, extraCostSchema } from "@/lib/validators";
import {
  ensureDefaultGroup,
  ensureCostGroupForSupplier,
} from "./groups-actions";

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

  // Auf der Kosten-Seite steht jede Zumietung in einer Gruppe (kind COST).
  // Ohne explizite Angabe (z.B. beim Zumieten aus dem Material-Tab) wird die
  // Gruppe aus dem Vermieter abgeleitet: pro Vermieter genau eine Gruppe.
  const costGroupId =
    nullable(data.costGroupId) ??
    (await ensureCostGroupForSupplier(projectId, data.supplier));
  const costSortOrder = await nextCostSortOrderForGroup(projectId, costGroupId);

  await prisma.projectSubhire.create({
    data: {
      projectId,
      deviceId: nullable(data.deviceId),
      adHocItemId: nullable(data.adHocItemId),
      groupId,
      costGroupId,
      name: data.name.trim(),
      supplier: nullable(data.supplier),
      quantity: data.quantity,
      unitCost: new Prisma.Decimal(data.unitCost),
      notes: nullable(data.notes),
      sortOrder,
      costSortOrder,
    },
    select: { id: true },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function updateSubhire(subhireId: string, input: SubhireInput) {
  await requireRole(CAN_WRITE);
  const data = subhireSchema.parse(input);

  // Kosten-Gruppe nur ändern, wenn explizit übergeben (undefined = unverändert,
  // z.B. bei Bearbeitung aus dem Material-Tab). `null` = wieder automatisch aus
  // dem Vermieter ableiten. Bei Gruppenwechsel ans Ende der Zielgruppe
  // einsortieren.
  let costGroupUpdate: { costGroupId: string; costSortOrder: number } | undefined;
  if (data.costGroupId !== undefined) {
    const existing = await prisma.projectSubhire.findUniqueOrThrow({
      where: { id: subhireId },
      select: { projectId: true, costGroupId: true },
    });
    const target =
      nullable(data.costGroupId) ??
      (await ensureCostGroupForSupplier(existing.projectId, data.supplier));
    if (target !== existing.costGroupId) {
      costGroupUpdate = {
        costGroupId: target,
        costSortOrder: await nextCostSortOrderForGroup(existing.projectId, target),
      };
    }
  }

  const updated = await prisma.projectSubhire.update({
    where: { id: subhireId },
    data: {
      deviceId: nullable(data.deviceId),
      adHocItemId: nullable(data.adHocItemId),
      groupId: nullable(data.groupId),
      name: data.name.trim(),
      supplier: nullable(data.supplier),
      quantity: data.quantity,
      unitCost: new Prisma.Decimal(data.unitCost),
      notes: nullable(data.notes),
      ...(costGroupUpdate ?? {}),
    },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${updated.projectId}`);
}

/** Nur die Anzahl ändern (QtyStepper auf der Kosten-Seite). */
export async function updateSubhireQuantity(subhireId: string, quantity: number) {
  await requireRole(CAN_WRITE);
  const q = Math.max(1, Math.floor(quantity));
  const updated = await prisma.projectSubhire.update({
    where: { id: subhireId },
    data: { quantity: q },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${updated.projectId}`);
}

/** Zumietung in andere Kosten-Gruppe (kind COST) verschieben. */
export async function moveSubhireToCostGroup(subhireId: string, groupId: string) {
  await requireRole(CAN_WRITE);
  const s = await prisma.projectSubhire.findUniqueOrThrow({
    where: { id: subhireId },
    select: { projectId: true },
  });
  const costSortOrder = await nextCostSortOrderForGroup(s.projectId, groupId);
  await prisma.projectSubhire.update({
    where: { id: subhireId },
    data: { costGroupId: groupId, costSortOrder },
    select: { id: true },
  });
  revalidatePath(`/projects/${s.projectId}`);
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

  // Jede Extrakosten-Position steht in einer Kosten-Gruppe (kind COST) —
  // derselben Gruppenart wie Zumietungen.
  const groupId =
    nullable(data.groupId) ?? (await ensureDefaultGroup(projectId, "COST"));
  const sortOrder = await nextCostSortOrderForGroup(projectId, groupId);

  await prisma.projectExtraCost.create({
    data: {
      projectId,
      groupId,
      label: data.label.trim(),
      kind: data.kind,
      amount: new Prisma.Decimal(data.amount),
      notes: nullable(data.notes),
      sortOrder,
    },
    select: { id: true },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function updateExtraCost(costId: string, input: ExtraCostInput) {
  await requireRole(CAN_WRITE);
  const data = extraCostSchema.parse(input);

  // Gruppe nur ändern, wenn explizit übergeben; bei Wechsel ans Ende einsortieren.
  let groupUpdate: { groupId: string; sortOrder: number } | undefined;
  if (data.groupId !== undefined) {
    const existing = await prisma.projectExtraCost.findUniqueOrThrow({
      where: { id: costId },
      select: { projectId: true, groupId: true },
    });
    const target =
      nullable(data.groupId) ??
      (await ensureDefaultGroup(existing.projectId, "COST"));
    if (target !== existing.groupId) {
      groupUpdate = {
        groupId: target,
        sortOrder: await nextCostSortOrderForGroup(existing.projectId, target),
      };
    }
  }

  const updated = await prisma.projectExtraCost.update({
    where: { id: costId },
    data: {
      label: data.label.trim(),
      kind: data.kind,
      amount: new Prisma.Decimal(data.amount),
      notes: nullable(data.notes),
      ...(groupUpdate ?? {}),
    },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${updated.projectId}`);
}

/** Extrakosten-Position in andere Kosten-Gruppe (kind COST) verschieben. */
export async function moveExtraCostToGroup(costId: string, groupId: string) {
  await requireRole(CAN_WRITE);
  const c = await prisma.projectExtraCost.findUniqueOrThrow({
    where: { id: costId },
    select: { projectId: true },
  });
  const sortOrder = await nextCostSortOrderForGroup(c.projectId, groupId);
  await prisma.projectExtraCost.update({
    where: { id: costId },
    data: { groupId, sortOrder },
    select: { id: true },
  });
  revalidatePath(`/projects/${c.projectId}`);
}

export async function removeExtraCost(costId: string) {
  await requireRole(CAN_WRITE);
  const removed = await prisma.projectExtraCost.delete({
    where: { id: costId },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${removed.projectId}`);
}
