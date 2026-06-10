"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { recomputeInvoiceNextSequence, recomputeQuoteNextSequence, recomputeReminderNextSequence, getSettings } from "@/lib/settings";
import { createInvoice } from "../projects/[id]/finances-actions";

/**
 * Setzt das `paidAt`-Datum einer Rechnung. `null` = wieder als unbezahlt markieren.
 */
export async function setInvoicePaid(invoiceId: string, paidAt: Date | null) {
  await requireRole(CAN_WRITE);
  const inv = await prisma.invoice.update({
    where: { id: invoiceId },
    data: { paidAt },
    select: { projectId: true },
  });
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
