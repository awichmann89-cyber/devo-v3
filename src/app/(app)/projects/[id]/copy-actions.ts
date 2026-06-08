"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { auth } from "@/auth";

/**
 * Erzeugt eine Kopie des Projekts mit verschobenen Daten.
 * - Gruppen (mit Rabatt + billable-Flag)
 * - Geräte-Buchungen + Service-Positionen + Kabel-Buchungen (mit neuer groupId)
 * - Notizen + Berechnungszeiträume (proportional verschoben)
 * - Status zurück auf DRAFT, confirmedAt + packToken zurückgesetzt
 * - Rechnungen, Angebote, PackingScans werden NICHT mitkopiert.
 *
 * Berechnungszeiträume werden um die gleiche Differenz verschoben wie
 * `planningStart`. Damit bleiben Pausen zwischen mehreren Zeiträumen
 * erhalten.
 */
export async function copyProject(
  sourceId: string,
  input: {
    name: string;
    planningStart: Date;
    planningEnd: Date;
  }
): Promise<{ id: string }> {
  await requireRole(CAN_WRITE);
  const session = await auth();

  const source = await prisma.project.findUnique({
    where: { id: sourceId },
    include: {
      groups: true,
      assignments: true,
      services: true,
      cableAssignments: true,
      projectNotes: true,
      billingPeriods: true,
    },
  });
  if (!source) throw new Error("Quell-Projekt nicht gefunden");

  const name = input.name.trim();
  if (!name) throw new Error("Name darf nicht leer sein");
  if (input.planningEnd < input.planningStart) {
    throw new Error("Planungs-Ende muss nach Start liegen");
  }

  // Tages-Differenz Source → Ziel, um BillingPeriods proportional zu verschieben
  const dayMs = 24 * 60 * 60 * 1000;
  const sourceStartMs = source.planningStart.getTime();
  const targetStartMs = input.planningStart.getTime();
  const offsetDays = Math.round((targetStartMs - sourceStartMs) / dayMs);

  const shifted = (d: Date): Date => {
    const t = new Date(d);
    t.setDate(t.getDate() + offsetDays);
    return t;
  };

  const created = await prisma.$transaction(async (tx) => {
    // 1) Projekt anlegen
    const newProject = await tx.project.create({
      data: {
        name,
        customerId: source.customerId,
        description: source.description,
        status: "DRAFT",
        kind: source.kind,
        planningStart: input.planningStart,
        planningEnd: input.planningEnd,
        discountPercent: source.discountPercent,
        materialDiscountPercent: source.materialDiscountPercent,
        servicesDiscountPercent: source.servicesDiscountPercent,
        notes: source.notes,
        confirmedAt: null,
        packToken: null,
        createdById: session?.user.id ?? null,
      },
      select: { id: true },
    });

    // 2) Gruppen kopieren — Map old → new id für FK-Mapping
    const groupIdMap = new Map<string, string>();
    for (const g of source.groups) {
      const newG = await tx.projectGroup.create({
        data: {
          projectId: newProject.id,
          name: g.name,
          kind: g.kind,
          sortOrder: g.sortOrder,
          discountPercent: g.discountPercent,
          billable: g.billable,
        },
        select: { id: true },
      });
      groupIdMap.set(g.id, newG.id);
    }

    // 3) Geräte-Buchungen
    for (const a of source.assignments) {
      const newGroupId = groupIdMap.get(a.groupId);
      if (!newGroupId) continue;
      await tx.projectAssignment.create({
        data: {
          projectId: newProject.id,
          deviceId: a.deviceId,
          groupId: newGroupId,
          quantity: a.quantity,
          notes: a.notes,
        },
      });
    }

    // 4) Service-Positionen
    for (const s of source.services) {
      const newGroupId = groupIdMap.get(s.groupId);
      if (!newGroupId) continue;
      await tx.projectService.create({
        data: {
          projectId: newProject.id,
          serviceItemId: s.serviceItemId,
          groupId: newGroupId,
          quantity: s.quantity,
          unitPriceOverride: s.unitPriceOverride,
          notes: s.notes,
        },
      });
    }

    // 5) Kabel-Buchungen
    for (const ca of source.cableAssignments) {
      const newGroupId = groupIdMap.get(ca.groupId);
      if (!newGroupId) continue;
      await tx.projectCableAssignment.create({
        data: {
          projectId: newProject.id,
          cableId: ca.cableId,
          groupId: newGroupId,
          quantity: ca.quantity,
          notes: ca.notes,
        },
      });
    }

    // 6) Notizen
    for (const n of source.projectNotes) {
      await tx.projectNote.create({
        data: {
          projectId: newProject.id,
          title: n.title,
          content: n.content,
        },
      });
    }

    // 7) Berechnungszeiträume — proportional verschoben
    for (const bp of source.billingPeriods) {
      await tx.billingPeriod.create({
        data: {
          projectId: newProject.id,
          start: shifted(bp.start),
          end: shifted(bp.end),
          notes: bp.notes,
        },
      });
    }

    return newProject;
  });

  revalidatePath("/projects");
  redirect(`/projects/${created.id}`);
}
