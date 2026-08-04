"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import {
  projectSchema,
  projectUpdateCoreSchema,
  assignmentSchema,
} from "@/lib/validators";
import { findConflicts } from "@/lib/availability";
import { redirect } from "next/navigation";
import { nextSortOrderForGroup } from "@/lib/project-sort-order";
import {
  recomputeInvoiceNextSequence,
  recomputeQuoteNextSequence,
  recomputeReminderNextSequence,
} from "@/lib/settings";

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
      maintainerId: rest.maintainerId || null,
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
  // Nur Kern-Felder hier — Zeiträume werden im eigenen Tab über
  // `updateProjectPeriods` gepflegt. Frontend darf weitere Felder mitsenden,
  // die werden vom Schema-Parse verworfen.
  const data = projectUpdateCoreSchema.parse(input);

  // Beim erstmaligen Übergang auf CONFIRMED `confirmedAt` setzen, damit die
  // Reservierungslogik weiß, welches Projekt bei Material-Konflikten Vorrang hat.
  const existing = await prisma.project.findUnique({
    where: { id },
    select: { confirmedAt: true },
  });

  await prisma.project.update({
    where: { id },
    data: {
      name: data.name,
      customerId: data.customerId || null,
      maintainerId: data.maintainerId || null,
      description: data.description || null,
      status: data.status,
      kind: data.kind,
      discountPercent: data.discountPercent,
      notes: data.notes || null,
      confirmedAt:
        data.status === "CONFIRMED" && !existing?.confirmedAt
          ? new Date()
          : undefined,
    },
    select: { id: true },
  });
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
}

export async function deleteProject(id: string) {
  await requireRole(CAN_WRITE);

  // Quote + Invoice + TimeEntry hängen mit onDelete: Restrict am Projekt —
  // die DB verhindert also ein stilles Kaskadieren der Finanz-Dokumente und
  // Lohn-Belege. Beim bewussten Löschen des Projekts (Confirm-Dialog warnt
  // explizit) räumen wir sie daher in derselben Transaktion mit ab. Mahnungen
  // hängen per Cascade an ihrer Rechnung bzw. tragen selbst die projectId;
  // PersonAssignments kaskadieren über die projectId automatisch.
  const [deletedQuotes, deletedInvoices] = await prisma.$transaction([
    prisma.quote.deleteMany({ where: { projectId: id } }),
    prisma.invoice.deleteMany({ where: { projectId: id } }),
    prisma.timeEntry.deleteMany({ where: { projectId: id } }),
    prisma.project.delete({ where: { id } }),
  ]);

  // Nummernkreise freigeben, falls ein gelöschtes Dokument die höchste
  // Nummer trug — analog zu deleteQuote/deleteInvoice.
  if (deletedQuotes.count > 0) await recomputeQuoteNextSequence();
  if (deletedInvoices.count > 0) {
    await recomputeInvoiceNextSequence();
    await recomputeReminderNextSequence();
  }

  revalidatePath("/projects");
  revalidatePath("/finances/quotes");
  revalidatePath("/finances/invoices");
  revalidatePath("/finances/forecast");
  revalidatePath("/settings");
  redirect("/projects");
}

/**
 * Bucht ein Gerät auf ein Projekt. Gibt Konflikte zurück, falls vorhanden
 * (mehr Geräte gebucht als verfügbar). Bei force=true wird trotzdem gebucht.
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
      [data.deviceId],
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

  // Immer eine neue Buchung anlegen — dasselbe Gerät darf bewusst mehrfach
  // im Projekt vorkommen (z.B. einmal pro Gruppe). Anzahl-Änderungen laufen
  // über updateAssignmentQuantity / Drag&Drop in der UI.
  //
  // sortOrder wird auf max(gruppe) + 1 gesetzt, damit ein neu gebuchtes
  // Gerät zuverlässig am Ende der Gruppe erscheint (und nicht oben wie
  // mit dem Default 0).
  const sortOrder = await nextSortOrderForGroup(projectId, data.groupId);
  await prisma.projectAssignment.create({
    data: {
      projectId,
      deviceId: data.deviceId,
      groupId: data.groupId,
      quantity: data.quantity,
      notes: data.notes || null,
      sortOrder,
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
