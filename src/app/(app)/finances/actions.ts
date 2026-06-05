"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";

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
  revalidatePath("/finances/invoices");
  revalidatePath("/finances/forecast");
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
  revalidatePath("/finances/quotes");
  revalidatePath(`/projects/${q.projectId}`);
}
