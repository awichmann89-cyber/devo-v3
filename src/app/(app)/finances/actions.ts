"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { recomputeInvoiceNextSequence, recomputeQuoteNextSequence, recomputeReminderNextSequence, getSettings } from "@/lib/settings";
import { createInvoice } from "../projects/[id]/finances-actions";

/**
 * Schaltet eine bestehende Rechnung zwischen regulärer Rechnung und Vorkasse
 * um. Bei `true` wird im PDF der „Vorkasse zum"-Hinweis ausgegeben statt
 * „Rechnungsdatum". Mahnungen können nicht auf Vorkasse umgestellt werden —
 * sie behalten ihr Kind.
 */
export async function setInvoicePrepayment(
  invoiceId: string,
  isPrepayment: boolean
) {
  await requireRole(CAN_WRITE);
  const inv = await prisma.invoice.update({
    where: { id: invoiceId },
    data: { isPrepayment },
    select: { projectId: true },
  });
  revalidatePath("/finances");
  revalidatePath("/finances/invoices");
  revalidatePath(`/projects/${inv.projectId}`);
}

/**
 * Setzt das `paidAt`-Datum einer Rechnung. `null` = wieder als unbezahlt markieren.
 *
 * Sind nach dem Zahlungseingang alle regulären Rechnungen des Projekts
 * bezahlt, wird der Projekt-Status automatisch auf COMPLETED gesetzt.
 * Zwei Ausnahmen:
 * - Nur bezahlte Vorkasse-Rechnungen schließen NICHT ab — die Veranstaltung
 *   steht dann i.d.R. noch aus, und COMPLETED würde die Material-
 *   Reservierung freigeben (siehe blockingStatuses in lib/availability.ts).
 * - CANCELLED bleibt unangetastet; das Zurücksetzen auf unbezahlt macht
 *   den Statuswechsel nicht automatisch rückgängig (manuell änderbar).
 */
export async function setInvoicePaid(invoiceId: string, paidAt: Date | null) {
  await requireRole(CAN_WRITE);
  const inv = await prisma.invoice.update({
    where: { id: invoiceId },
    data: { paidAt },
    select: { projectId: true },
  });

  if (paidAt) {
    // Mahnungen (kind REMINDER) zählen nicht mit: Zahlungen werden auf der
    // Original-Rechnung erfasst, die Mahnung dupliziert nur deren Betrag.
    const [openInvoices, paidFinalInvoices] = await Promise.all([
      prisma.invoice.count({
        where: { projectId: inv.projectId, kind: "INVOICE", paidAt: null },
      }),
      prisma.invoice.count({
        where: {
          projectId: inv.projectId,
          kind: "INVOICE",
          isPrepayment: false,
          paidAt: { not: null },
        },
      }),
    ]);
    if (openInvoices === 0 && paidFinalInvoices > 0) {
      await prisma.project.updateMany({
        where: {
          id: inv.projectId,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        data: { status: "COMPLETED" },
      });
      revalidatePath("/projects");
    }
  }

  revalidatePath("/finances");
  revalidatePath("/finances/invoices");
  revalidatePath("/finances/forecast");
  revalidatePath(`/projects/${inv.projectId}`);
}

/**
 * Löscht eine Rechnung von der zentralen Rechnungsliste aus.
 */
export async function deleteInvoiceFromList(invoiceId: string) {
  await requireRole(CAN_WRITE);
  const inv = await prisma.invoice.delete({
    where: { id: invoiceId },
    select: { projectId: true, kind: true },
  });
  if (inv.kind === "REMINDER") {
    await recomputeReminderNextSequence();
  } else {
    await recomputeInvoiceNextSequence();
  }
  revalidatePath("/finances/invoices");
  revalidatePath("/finances/forecast");
  revalidatePath("/finances/pending");
  revalidatePath("/settings");
  revalidatePath(`/projects/${inv.projectId}`);
}

/**
 * Legt eine Mahnung zu einer bestehenden Rechnung an. Beträge werden aus
 * der Original-Rechnung übernommen; Fälligkeit wird aus den Settings
 * (invoiceDueDays) als „heute + N Tage" gesetzt.
 */
export async function createReminderForInvoice(
  invoiceId: string
): Promise<{ id: string; number: string }> {
  await requireRole(CAN_WRITE);
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { projectId: true },
  });
  if (!inv) throw new Error("Rechnung nicht gefunden");

  const settings = await getSettings();
  const dueDays = Math.max(1, Number(settings.invoiceDueDays) || 7);
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + dueDays);

  const created = await createInvoice(inv.projectId, dueDate, 0, {
    relatedInvoiceId: invoiceId,
  });
  return created;
}

/**
 * Löscht ein Angebot von der zentralen Angebotsliste aus.
 */
export async function deleteQuoteFromList(quoteId: string) {
  await requireRole(CAN_WRITE);
  const q = await prisma.quote.delete({
    where: { id: quoteId },
    select: { projectId: true },
  });
  await recomputeQuoteNextSequence();
  revalidatePath("/finances/quotes");
  revalidatePath("/settings");
  revalidatePath(`/projects/${q.projectId}`);
}
