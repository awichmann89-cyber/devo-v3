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
      groups: {
        include: { billingPeriods: true },
        orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
      },
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
  options?: {
    relatedInvoiceId?: string;
    /** Vorkasse-/Anzahlungsrechnung über diesen Anteil des Gesamtauftrags. */
    prepaymentPercent?: number;
    /** Schlussrechnung: zieht bestehende Vorkasse-Rechnungen ab. */
    isFinal?: boolean;
    /**
     * Beim Überschreiben einer Rechnung: exakte Nummer, die die neue Rechnung
     * erhalten soll, statt automatisch die nächste Sequenznummer zu ziehen.
     * Die Überschreiben-UI belegt dies standardmäßig mit der Nummer der
     * ersetzten Rechnung vor, damit beim Überschreiben keine neue Nummer
     * gezogen wird. Manuell änderbar, z.B. um eine zuvor falsch vergebene
     * Nummer nachträglich zu korrigieren.
     */
    customNumber?: string;
  }
): Promise<{ id: string; number: string }> {
  await requireRole(CAN_WRITE);

  const year = new Date().getFullYear();
  const settings = await getSettings();
  const vatPercent = Math.max(0, Math.min(100, Number(settings.vatPercent) || 0));
  const isReminder = !!options?.relatedInvoiceId;
  void totalNet; // wird vom Snapshot überschrieben — Parameter bleibt nur für Backward-Compat

  let number: string;
  if (options?.customNumber) {
    number = options.customNumber.trim();
    if (!number) throw new Error("Rechnungsnummer darf nicht leer sein");
    const clash = await prisma.invoice.findUnique({ where: { number } });
    if (clash) throw new Error(`Rechnungsnummer ${number} ist bereits vergeben`);
  } else {
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
    number = isReminder
      ? buildReminderNumber(year, nextSequence, prefix, padding)
      : buildInvoiceNumber(year, nextSequence, prefix, padding);
  }

  // Snapshot bauen — entweder aus dem Original (bei Mahnung) oder aus dem
  // aktuellen Projekt-Stand (bei normaler Rechnung). Der Snapshot ist die
  // Quelle der Wahrheit für totalNet/totalGross und das spätere PDF-Rendering.
  const round2 = (n: number) => Math.round(n * 100) / 100;
  let snapshotJson: Prisma.InputJsonValue | undefined;
  let useTotalNet: number;
  let useTotalGross: number | null = null;
  let useVatPercent = vatPercent;
  let reminderLevel = 0;
  // Vorkasse-/Schlussrechnungs-Felder (nur bei regulärer Rechnung gesetzt).
  let prepaymentPercentValue: number | null = null;
  let deductionsJson: Prisma.InputJsonValue | undefined;
  let isPrepaymentInvoice = false;

  if (options?.relatedInvoiceId) {
    // Mahnung: Snapshot, Beträge und Steuersatz aus der Original-Rechnung
    // übernehmen — die Mahnung ist inhaltlich identisch zur Rechnung,
    // nur mit anderem Titel und anderem Datum.
    const orig = await prisma.invoice.findUnique({
      where: { id: options.relatedInvoiceId },
      select: {
        totalNet: true,
        totalGross: true,
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
    useTotalGross = orig.totalGross !== null ? Number(orig.totalGross) : null;
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
      pdfAccentColor: settings.pdfAccentColor,
    });
    snapshotJson = snap as unknown as Prisma.InputJsonValue;
    // Der Snapshot enthält immer den VOLLEN Auftrag. Vorkasse/Schlussrechnung
    // leiten daraus nur den anteiligen bzw. Restbetrag ab.
    const fullNet = snap.totals.totalNet;
    const fullGross = round2(fullNet * (1 + useVatPercent / 100));

    if (options?.prepaymentPercent != null) {
      // Vorkasse-/Anzahlungsrechnung über einen Anteil des Gesamtauftrags.
      const pct = Math.max(0, Math.min(100, Number(options.prepaymentPercent) || 0));
      if (pct <= 0) throw new Error("Vorkasse-Prozentsatz muss größer als 0 sein");
      isPrepaymentInvoice = true;
      prepaymentPercentValue = pct;
      useTotalNet = round2((fullNet * pct) / 100);
      useTotalGross = round2(useTotalNet * (1 + useVatPercent / 100));
    } else if (options?.isFinal) {
      // Schlussrechnung: bereits berechnete Vorkasse-Rechnungen abziehen.
      const prepays = await prisma.invoice.findMany({
        where: { projectId, kind: "INVOICE", prepaymentPercent: { not: null } },
        select: { number: true, totalNet: true, totalGross: true },
        orderBy: { date: "asc" },
      });
      if (prepays.length === 0) {
        throw new Error("Keine Vorkasse-Rechnung vorhanden, die abgezogen werden könnte");
      }
      const prepaidNet = prepays.reduce((s, p) => s + Number(p.totalNet), 0);
      const prepaidGross = prepays.reduce(
        (s, p) => s + (p.totalGross !== null ? Number(p.totalGross) : 0),
        0
      );
      useTotalNet = round2(fullNet - prepaidNet);
      useTotalGross = round2(fullGross - prepaidGross);
      deductionsJson = prepays.map((p) => ({
        number: p.number,
        netAmount: round2(Number(p.totalNet)),
        grossAmount: round2(p.totalGross !== null ? Number(p.totalGross) : 0),
      })) as unknown as Prisma.InputJsonValue;
    } else {
      // Normale Vollrechnung.
      useTotalNet = fullNet;
      useTotalGross = fullGross;
    }
  }

  const totalNetDec = new Prisma.Decimal(useTotalNet);
  const totalGrossDec =
    useTotalGross !== null
      ? new Prisma.Decimal(useTotalGross)
      : totalNetDec.mul(new Prisma.Decimal(1 + useVatPercent / 100));

  const inv = await prisma.invoice.create({
    data: {
      projectId,
      number,
      kind: options?.relatedInvoiceId ? "REMINDER" : "INVOICE",
      reminderLevel,
      relatedInvoiceId: options?.relatedInvoiceId ?? null,
      isPrepayment: isPrepaymentInvoice,
      prepaymentPercent:
        prepaymentPercentValue !== null
          ? new Prisma.Decimal(prepaymentPercentValue)
          : null,
      deductions: deductionsJson,
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
    pdfAccentColor: settings.pdfAccentColor,
  });
  const snapshotJson = snap as unknown as Prisma.InputJsonValue;

  const totalNetDec = new Prisma.Decimal(snap.totals.totalNet);
  const totalGrossDec = totalNetDec.mul(new Prisma.Decimal(1 + vatPercent / 100));

  // acceptToken — Random-Token (URL-safe), wird im PDF und auf der Public-Route
  // /angebot/<token> verwendet. Wir generieren via crypto.randomUUID()
  // (verfügbar in Node 19+ und auch im Edge-Runtime), strippen die Bindestriche
  // damit der Token rein alphanumerisch ist und damit auch in QR-Codes
  // effizient ist (falls wir mal welche fürs Angebot bauen).
  const acceptToken = globalThis.crypto.randomUUID().replace(/-/g, "");

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
      acceptToken,
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

/**
 * Legt ein neues Angebot an UND markiert die übergebenen alten Angebote
 * als „durch das neue ersetzt" (supersededByQuoteId-Pointer).
 *
 * Im Gegensatz zum früheren delete+create-Pattern bleiben die alten
 * Angebote in der DB erhalten — ihre acceptToken-URLs leiten den Kunden
 * dadurch weiterhin auf das aktuelle Angebot (mit Banner „neue Version").
 * Wird vom Finanzen-Dialog beim „Überschreiben" aufgerufen.
 */
export async function createReplacementQuote(
  projectId: string,
  expiresAt: Date,
  totalNet: number,
  notes: string | null | undefined,
  existingQuoteIds: string[],
): Promise<{ id: string; number: string }> {
  await requireRole(CAN_WRITE);

  // Neues Angebot via bestehendem createQuote anlegen — das setzt auch den
  // acceptToken, baut Snapshot etc.
  const created = await createQuote(projectId, expiresAt, totalNet, notes);

  // Alte Angebote als ersetzt markieren. updateMany ist atomar und schnell.
  if (existingQuoteIds.length > 0) {
    await prisma.quote.updateMany({
      where: { id: { in: existingQuoteIds }, supersededByQuoteId: null },
      data: { supersededByQuoteId: created.id },
    });
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/finances/quotes");
  return created;
}
