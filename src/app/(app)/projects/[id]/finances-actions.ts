"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { Prisma } from "@prisma/client";
import { getSettings, buildInvoiceNumber, buildQuoteNumber, recomputeInvoiceNextSequence, recomputeQuoteNextSequence } from "@/lib/settings";

export async function updateGroupDiscount(groupId: string, discountPercent: number) {
  await requireRole(CAN_WRITE);
  if (!isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new Error("Rabatt muss zwischen 0 und 100 liegen");
  }
  const g = await prisma.projectGroup.update({
    where: { id: groupId },
    data: { discountPercent: new Prisma.Decimal(discountPercent) },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${g.projectId}`);
}

export async function updateProjectDiscount(projectId: string, discountPercent: number) {
  await requireRole(CAN_WRITE);
  if (!isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new Error("Rabatt muss zwischen 0 und 100 liegen");
  }
  await prisma.project.update({
    where: { id: projectId },
    data: { discountPercent: new Prisma.Decimal(discountPercent) },
    select: { id: true },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function updateBereichDiscount(
  projectId: string,
  kind: "MATERIAL" | "SERVICE",
  discountPercent: number
) {
  await requireRole(CAN_WRITE);
  if (!isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new Error("Rabatt muss zwischen 0 und 100 liegen");
  }
  await prisma.project.update({
    where: { id: projectId },
    data:
      kind === "MATERIAL"
        ? { materialDiscountPercent: new Prisma.Decimal(discountPercent) }
        : { servicesDiscountPercent: new Prisma.Decimal(discountPercent) },
    select: { id: true },
  });
  revalidatePath(`/projects/${projectId}`);
}

/**
 * Legt eine neue Rechnung an. Nummer: YYYY-[PREFIX-]NNN, fortlaufend pro Jahr.
 * Berechnet totalGross via vatPercent aus den Settings.
 */
export async function createInvoice(
  projectId: string,
  dueDate: Date,
  totalNet: number
): Promise<{ id: string; number: string }> {
  await requireRole(CAN_WRITE);

  const year = new Date().getFullYear();
  const settings = await getSettings();
  const prefix = settings.invoiceNumberPrefix.trim();
  const padding = Math.max(1, Math.min(8, Number(settings.invoiceNumberPadding) || 3));
  const minSequence = Math.max(1, Number(settings.invoiceNumberNextSequence) || 1);
  const vatPercent = Math.max(0, Math.min(100, Number(settings.vatPercent) || 0));

  // Höchste vorhandene Sequenz dieses Jahres ermitteln
  const yearInvoices = await prisma.invoice.findMany({
    where: { number: { startsWith: `${year}-` } },
    select: { number: true },
  });
  let maxSeq = 0;
  for (const r of yearInvoices) {
    const m = r.number.match(/-(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n > maxSeq) maxSeq = n;
    }
  }
  const nextSequence = Math.max(maxSeq + 1, minSequence);
  const number = buildInvoiceNumber(year, nextSequence, prefix, padding);

  const totalNetDec = new Prisma.Decimal(totalNet);
  const totalGrossDec = totalNetDec.mul(new Prisma.Decimal(1 + vatPercent / 100));

  const inv = await prisma.invoice.create({
    data: {
      projectId,
      number,
      date: new Date(),
      dueDate,
      totalNet: totalNetDec,
      totalGross: totalGrossDec,
      vatPercent: new Prisma.Decimal(vatPercent),
    },
    select: { id: true, number: true },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/finances/invoices");
  revalidatePath("/finances/forecast");
  return inv;
}

export async function deleteInvoice(invoiceId: string) {
  await requireRole(CAN_WRITE);
  const inv = await prisma.invoice.delete({
    where: { id: invoiceId },
    select: { projectId: true },
  });
  // Rechnungsnummer freigeben, falls die gelöschte die höchste war
  await recomputeInvoiceNextSequence();
  revalidatePath(`/projects/${inv.projectId}`);
  revalidatePath("/finances/invoices");
  revalidatePath("/finances/forecast");
  revalidatePath("/settings");
}

/**
 * Legt ein neues Angebot an. Eigener Nummernkreis, eigenes Ablaufdatum.
 */
export async function createQuote(
  projectId: string,
  expiresAt: Date,
  totalNet: number
): Promise<{ id: string; number: string }> {
  await requireRole(CAN_WRITE);

  const year = new Date().getFullYear();
  const settings = await getSettings();
  const prefix = settings.quoteNumberPrefix.trim();
  const padding = Math.max(1, Math.min(8, Number(settings.quoteNumberPadding) || 3));
  const minSequence = Math.max(1, Number(settings.quoteNumberNextSequence) || 1);
  const vatPercent = Math.max(0, Math.min(100, Number(settings.vatPercent) || 0));

  const yearQuotes = await prisma.quote.findMany({
    where: { number: { startsWith: `${year}-` } },
    select: { number: true },
  });
  let maxSeq = 0;
  for (const r of yearQuotes) {
    const m = r.number.match(/-(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n > maxSeq) maxSeq = n;
    }
  }
  const nextSequence = Math.max(maxSeq + 1, minSequence);
  const number = buildQuoteNumber(year, nextSequence, prefix, padding);

  const totalNetDec = new Prisma.Decimal(totalNet);
  const totalGrossDec = totalNetDec.mul(new Prisma.Decimal(1 + vatPercent / 100));

  const q = await prisma.quote.create({
    data: {
      projectId,
      number,
      date: new Date(),
      expiresAt,
      totalNet: totalNetDec,
      totalGross: totalGrossDec,
      vatPercent: new Prisma.Decimal(vatPercent),
    },
    select: { id: true, number: true },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/finances/quotes");
  return q;
}

export async function deleteQuote(quoteId: string) {
  await requireRole(CAN_WRITE);
  const q = await prisma.quote.delete({
    where: { id: quoteId },
    select: { projectId: true },
  });
  // Angebotsnummer freigeben, falls die gelöschte die höchste war
  await recomputeQuoteNextSequence();
  revalidatePath(`/projects/${q.projectId}`);
  revalidatePath("/finances/quotes");
  revalidatePath("/settings");
}
