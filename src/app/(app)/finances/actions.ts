"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { recomputeInvoiceNextSequence, recomputeQuoteNextSequence } from "@/lib/settings";

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
    select: { projectId: true },
  });
  await recomputeInvoiceNextSequence();
  revalidatePath("/finances/invoices");
  revalidatePath("/finances/forecast");
  revalidatePath("/finances/pending");
  revalidatePath("/settings");
  revalidatePath(`/projects/${inv.projectId}`);
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
