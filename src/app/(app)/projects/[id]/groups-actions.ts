"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { ProjectGroupKind } from "@prisma/client";

/**
 * Stellt sicher, dass ein Projekt mindestens eine Gruppe vom angegebenen Typ hat.
 * Wird beim ersten Hinzufügen von Material/Service aufgerufen.
 * Gibt die ID der (default-)Gruppe zurück.
 */
export async function ensureDefaultGroup(
  projectId: string,
  kind: ProjectGroupKind
): Promise<string> {
  const existing = await prisma.projectGroup.findFirst({
    where: { projectId, kind },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.projectGroup.create({
    data: {
      projectId,
      kind,
      name: "Allgemein",
      sortOrder: 0,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Prüft, dass alle Zeitraum-IDs zu Berechnungszeiträumen DIESES Projekts
 * gehören — sonst könnte eine manipulierte Anfrage fremde Zeiträume verknüpfen.
 */
async function validatePeriodIds(projectId: string, periodIds: string[]) {
  if (periodIds.length === 0) return;
  const count = await prisma.billingPeriod.count({
    where: { id: { in: periodIds }, projectId },
  });
  if (count !== periodIds.length) {
    throw new Error("Ungültiger Berechnungszeitraum");
  }
}

export async function createProjectGroup(
  projectId: string,
  input: {
    name: string;
    kind: ProjectGroupKind;
    billable?: boolean;
    // Zugeordnete Berechnungszeiträume (leer/undefined = alle, Altverhalten)
    billingPeriodIds?: string[];
  }
) {
  await requireRole(CAN_WRITE);
  const name = input.name.trim();
  if (!name) throw new Error("Name darf nicht leer sein");
  const periodIds = input.billingPeriodIds ?? [];
  await validatePeriodIds(projectId, periodIds);

  // Höchste sortOrder ermitteln
  const last = await prisma.projectGroup.findFirst({
    where: { projectId, kind: input.kind },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const created = await prisma.projectGroup.create({
    data: {
      projectId,
      kind: input.kind,
      name,
      sortOrder,
      billable: input.billable ?? true,
      billingPeriods: { connect: periodIds.map((id) => ({ id })) },
    },
    select: { id: true },
  });

  revalidatePath(`/projects/${projectId}`);
  return { id: created.id };
}

export async function updateProjectGroup(
  id: string,
  input: { name?: string; billable?: boolean; billingPeriodIds?: string[] }
) {
  await requireRole(CAN_WRITE);
  const existing = await prisma.projectGroup.findUnique({
    where: { id },
    select: { projectId: true },
  });
  if (!existing) throw new Error("Gruppe nicht gefunden");

  const data: {
    name?: string;
    billable?: boolean;
    billingPeriods?: { set: { id: string }[] };
  } = {};
  if (input.name !== undefined) {
    const t = input.name.trim();
    if (!t) throw new Error("Name darf nicht leer sein");
    data.name = t;
  }
  if (input.billable !== undefined) {
    data.billable = input.billable;
  }
  if (input.billingPeriodIds !== undefined) {
    await validatePeriodIds(existing.projectId, input.billingPeriodIds);
    data.billingPeriods = { set: input.billingPeriodIds.map((pid) => ({ id: pid })) };
  }
  await prisma.projectGroup.update({
    where: { id },
    data,
    select: { id: true },
  });
  revalidatePath(`/projects/${existing.projectId}`);
}

// Beibehalten für Rückwärtskompatibilität — leitet nur an updateProjectGroup weiter.
export async function renameProjectGroup(id: string, name: string) {
  return updateProjectGroup(id, { name });
}

export async function setProjectGroupBillable(id: string, billable: boolean) {
  return updateProjectGroup(id, { billable });
}

/**
 * Löscht eine Gruppe. Wenn `moveToGroupId` gesetzt, werden enthaltene Items
 * dorthin verschoben. Ansonsten werden sie mitgelöscht (Cascade).
 */
export async function deleteProjectGroup(
  id: string,
  moveToGroupId?: string | null
) {
  await requireRole(CAN_WRITE);

  const group = await prisma.projectGroup.findUnique({
    where: { id },
    select: { projectId: true, kind: true },
  });
  if (!group) throw new Error("Gruppe nicht gefunden");

  if (moveToGroupId) {
    // Prüfen, dass Zielgruppe denselben kind hat
    const target = await prisma.projectGroup.findUnique({
      where: { id: moveToGroupId },
      select: { projectId: true, kind: true },
    });
    if (!target || target.projectId !== group.projectId || target.kind !== group.kind) {
      throw new Error("Zielgruppe ist ungültig");
    }

    const moveOps = (() => {
      switch (group.kind) {
        case "MATERIAL":
          // Material-Gruppen enthalten Geräte, Kabel und Ad-hoc-Positionen.
          return [
            prisma.projectAssignment.updateMany({
              where: { groupId: id },
              data: { groupId: moveToGroupId },
            }),
            prisma.projectCableAssignment.updateMany({
              where: { groupId: id },
              data: { groupId: moveToGroupId },
            }),
            prisma.projectAdHocItem.updateMany({
              where: { groupId: id },
              data: { groupId: moveToGroupId },
            }),
          ];
        case "SUBHIRE":
          return [
            prisma.projectSubhire.updateMany({
              where: { costGroupId: id },
              data: { costGroupId: moveToGroupId },
            }),
          ];
        case "EXTRA":
          return [
            prisma.projectExtraCost.updateMany({
              where: { groupId: id },
              data: { groupId: moveToGroupId },
            }),
          ];
        default:
          return [
            prisma.projectService.updateMany({
              where: { groupId: id },
              data: { groupId: moveToGroupId },
            }),
          ];
      }
    })();

    await prisma.$transaction([...moveOps, prisma.projectGroup.delete({ where: { id } })]);
  } else {
    await prisma.projectGroup.delete({ where: { id } });
  }

  revalidatePath(`/projects/${group.projectId}`);
}

export async function reorderProjectGroups(orderedIds: string[]) {
  await requireRole(CAN_WRITE);
  if (orderedIds.length === 0) return;

  // Alle gehören demselben Projekt? -> erste laden für Path
  const first = await prisma.projectGroup.findUnique({
    where: { id: orderedIds[0] },
    select: { projectId: true },
  });

  await prisma.$transaction(
    orderedIds.map((id, idx) =>
      prisma.projectGroup.update({
        where: { id },
        data: { sortOrder: idx },
        select: { id: true },
      })
    )
  );

  if (first) revalidatePath(`/projects/${first.projectId}`);
}
