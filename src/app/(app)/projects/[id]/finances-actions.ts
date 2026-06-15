"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { Prisma } from "@prisma/client";
import { getSettings, buildInvoiceNumber, buildQuoteNumber, buildReminderNumber, recomputeInvoiceNextSequence, recomputeQuoteNextSequence, recomputeReminderNextSequence } from "@/lib/settings";
import { buildSnapshotFromProject } from "@/lib/document-snapshot";

/**
 * Lädt das Projekt mit allen für den Snapshot benötigten Relationen.
 * Wird vor createInvoice / createQuote aufgerufen, damit der ausgegebene
 * Stand des Dokuments unveränderlich konserviert werden kann.
 */
async function loadProjectForSnapshot(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      customer: true,
      billingPeriods: { orderBy: { start: "asc" } },
      groups: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] },
      assignments: { include: { device: true } },
      services: { include: { serviceItem: true } },
      adHocItems: { orderBy: { sortOrder: "asc" } },
      groupComments: { orderBy: { sortOrder: "asc" } },
      maintainer: { select: { name: true, email: true } },
    },
  });
}

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
 *
 * Wenn `relatedInvoiceId` gesetzt ist, wird eine Mahnung zur Original-Rechnung
 * angelegt — eigene fortlaufende Nummer, kind=REMINDER, reminderLevel = bestehende
 * Mahnungen zur Original-Rechnung + 1. Beträge werden aus der Original-Rechnung
 * übernommen (statt aus `totalNet`).
 */
export async function createInvoice(
  projectId: string,
  dueDate: Date,
  totalNet: number,
  options?: { relatedInvoiceId?: string; isPrepayment?: boolean }
): Promise<{ id: string; number: string }> {
  await requireRole(CAN_WRITE);

  const year = new Date().getFullYear();
  const settings = await getSettings();
  const vatPercent = Math.max(0, Math.min(100, Number(settings.vatPercent) || 0));
  const isReminder = !!options?.relatedInvoiceId;
  void totalNet; // wird vom Snapshot überschrieben — Parameter bleibt nur für Backward-Compat

  // Nummernkreis abhängig vom Typ: Mahnungen haben eigenen Prefix/Counter
  const prefix = isReminder
    ? settings.reminderNumberPrefix.trim()
    : settings.invoiceNumberPrefix.trim();
  const padding = Math.max(
    1,
    Math.min(
      8,
      Number(
        isReminder
          ? settings.reminderNumberPadding
          : settings.invoiceNumberPadding
      ) || 3
    )
  );
  const minSequence = Math.max(
    1,
    Number(
      isReminder
        ? settings.reminderNumberNextSequence
        : settings.invoiceNumberNextSequence
    ) || 1
  );

  // Höchste vorhandene Sequenz dieses Jahres und Typs ermitteln —
  // nur über das gleiche Prefix-Schema iterieren, damit Mahnungen und
  // Rechnungen sich ihre Sequenzen nicht gegenseitig „klauen".
  const numberPrefix = prefix ? `${year}-${prefix}-` : `${year}-`;
  const yearInvoices = await prisma.invoice.findMany({
    where: {
      kind: isReminder ? "REMINDER" : "INVOICE",
      number: { startsWith: numberPrefix },
    },
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
  const number = isReminder
    ? buildReminderNumber(year, nextSequence, prefix, padding)
    : buildInvoiceNumber(year, nextSequence, prefix, padding);

  // Snapshot bauen — entweder aus dem Original (bei Mahnung) oder aus dem
  // aktuellen Projekt-Stand (bei normaler Rechnung). Der Snapshot ist die
  // Quelle der Wahrheit für totalNet/totalGross und das spätere PDF-Rendering.
  let snapshotJson: Prisma.InputJsonValue | undefined;
  let useTotalNet: number;
  let useVatPercent = vatPercent;
  let reminderLevel = 0;

  if (options?.relatedInvoiceId) {
    // Mahnung: Snapshot, Beträge und Steuersatz aus der Original-Rechnung
    // übernehmen — die Mahnung ist inhaltlich identisch zur Rechnung,
    // nur mit anderem Titel und anderem Datum.
    const orig = await prisma.invoice.findUnique({
      where: { id: options.relatedInvoiceId },
      select: {
        totalNet: true,
        vatPercent: true,
        kind: true,
        reminderLevel: true,
        relatedInvoiceId: true,
        snapshot: true,
      },
    });
    if (!orig) throw new Error("Ursprungs-Rechnung nicht gefunden");
    const rootInvoiceId =
      orig.kind === "REMINDER" && orig.relatedInvoiceId
        ? orig.relatedInvoiceId
        : options.relatedInvoiceId;
    const existing = await prisma.invoice.count({
      where: { relatedInvoiceId: rootInvoiceId, kind: "REMINDER" },
    });
    reminderLevel = existing + 1;
    useTotalNet = Number(orig.totalNet);
    useVatPercent = Number(orig.vatPercent);
    options.relatedInvoiceId = rootInvoiceId;
    // Snapshot der Original-Rechnung 1:1 übernehmen (falls vorhanden)
    if (orig.snapshot !== null && orig.snapshot !== undefined) {
      snapshotJson = orig.snapshot as Prisma.InputJsonValue;
    }
  } else {
    // Normale Rechnung: Snapshot aus dem aktuellen Projekt-Stand bauen.
    const project = await loadProjectForSnapshot(projectId);
    if (!project) throw new Error("Projekt nicht gefunden");
    const snap = buildSnapshotFromProject(project, {
      vatPercent: settings.vatPercent,
      companyName: settings.companyName,
      companyStreet: settings.companyStreet,
      companyZipCity: settings.companyZipCity,
      dayFactorMap: settings.dayFactorMap,
      // Intro-/Outro-Text gehören nur ins Angebot, nicht in die Rechnung —
      // beim Snapshot der Rechnung daher leer halten.
      quoteIntroText: null,
      quoteOutroText: null,
    });
    snapshotJson = snap as unknown as Prisma.InputJsonValue;
    useTotalNet = snap.totals.totalNet;
  }

  const totalNetDec = new Prisma.Decimal(useTotalNet);
  const totalGrossDec = totalNetDec.mul(new Prisma.Decimal(1 + useVatPercent / 100));

  const inv = await prisma.invoice.create({
    data: {
      projectId,
      number,
      kind: options?.relatedInvoiceId ? "REMINDER" : "INVOICE",
      reminderLevel,
      relatedInvoiceId: options?.relatedInvoiceId ?? null,
      // Vorkasse nur bei regulärer Rechnung sinnvoll, nicht bei Mahnungen
      isPrepayment: !options?.relatedInvoiceId && !!options?.isPrepayment,
      date: new Date(),
      dueDate,
      totalNet: totalNetDec,
      totalGross: totalGrossDec,
      vatPercent: new Prisma.Decimal(useVatPercent),
      snapshot: snapshotJson,
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
    select: { projectId: true, kind: true },
  });
  // Nummer im passenden Kreis freigeben, falls die gelöschte die höchste war
  if (inv.kind === "REMINDER") {
    await recomputeReminderNextSequence();
  } else {
    await recomputeInvoiceNextSequence();
  }
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
  totalNet: number,
  notes?: string | null
): Promise<{ id: string; number: string }> {
  await requireRole(CAN_WRITE);

  const year = new Date().getFullYear();
  const settings = await getSettings();
  const prefix = settings.quoteNumberPrefix.trim();
  const padding = Math.max(1, Math.min(8, Number(settings.quoteNumberPadding) || 3));
  const minSequence = Math.max(1, Number(settings.quoteNumberNextSequence) || 1);
  const vatPercent = Math.max(0, Math.min(100, Number(settings.vatPercent) || 0));
  void totalNet; // wird vom Snapshot überschrieben — bleibt nur für Backward-Compat

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

  // Snapshot aus dem aktuellen Projekt-Stand bauen — friert die zum
  // Zeitpunkt der Ausgabe gültige Version des Angebots ein. Nachträgliche
  // Projekt-Änderungen verändern das Angebots-PDF dann nicht mehr.
  const project = await loadProjectForSnapshot(projectId);
  if (!project) throw new Error("Projekt nicht gefunden");
  const snap = buildSnapshotFromProject(project, {
    vatPercent: settings.vatPercent,
    companyName: settings.companyName,
    companyStreet: settings.companyStreet,
    companyZipCity: settings.companyZipCity,
    dayFactorMap: settings.dayFactorMap,
    quoteIntroText: settings.quoteIntroText,
    quoteOutroText: settings.quoteOutroText,
  });
  const snapshotJson = snap as unknown as Prisma.InputJsonValue;

  const totalNetDec = new Prisma.Decimal(snap.totals.totalNet);
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
      notes: notes?.trim() || null,
      snapshot: snapshotJson,
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
