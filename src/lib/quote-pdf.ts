import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jsPDF } from "jspdf";
import autoTable, { RowInput } from "jspdf-autotable";
import { projectKindLabel } from "@/lib/labels";
import { applyLetterhead } from "@/lib/letterhead";
import { buildDocumentPdfFilename } from "@/lib/utils";
import { getSettings, parseHexColor } from "@/lib/settings";
import { setupGeistFont } from "@/lib/pdf-fonts";
import { drawLabeledWrappedText } from "@/lib/pdf-text";
import {
  buildSnapshotFromProject,
  isValidSnapshot,
  type DocumentSnapshot,
} from "@/lib/document-snapshot";

// Beträge im deutschen Format mit Tausender-Trennzeichen, z.B. „1.234,56 €".
const fmt = (n: number) =>
  n.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " €";
const INDENT_1 = "    "; // Bereich
const INDENT_2 = "        "; // Gruppe
const INDENT_3 = "            "; // Item

const QUOTE_PDF_INCLUDE = {
  project: {
    include: {
      customer: true,
      billingPeriods: { orderBy: { start: "asc" } },
      groups: {
        include: { billingPeriods: true },
        orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
      },
      assignments: {
        include: { device: true },
      },
      services: { include: { serviceItem: true } },
      adHocItems: { orderBy: { sortOrder: "asc" } },
      groupComments: { orderBy: { sortOrder: "asc" } },
      maintainer: { select: { name: true, email: true } },
    },
  },
} satisfies Prisma.QuoteInclude;

export type QuoteWithProject = Prisma.QuoteGetPayload<{
  include: typeof QUOTE_PDF_INCLUDE;
}>;

export interface BuiltQuotePdf {
  bytes: Uint8Array;
  filename: string;
  quote: QuoteWithProject;
}

/**
 * Baut das Angebots-PDF (inkl. Briefpapier) für ein Quote. Wird sowohl vom
 * Download-Route-Handler (`.../quotes/[quoteId]/pdf/route.ts`) als auch beim
 * E-Mail-Versand (Anhang) verwendet — Auth/Token-Prüfung bleibt Sache der
 * jeweiligen Aufrufer, diese Funktion liefert nur die fertigen Bytes.
 *
 * `baseUrl` bestimmt den Host im „Angebot online annehmen"-Link — der
 * Route-Handler übergibt die Origin des Requests, der E-Mail-Versand die
 * konfigurierte App-URL (AUTH_URL).
 */
export async function buildQuotePdf(
  quoteId: string,
  baseUrl: string
): Promise<BuiltQuotePdf | null> {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: QUOTE_PDF_INCLUDE,
  });
  if (!quote) return null;

  const project = quote.project;
  const liveSettings = await getSettings();

  // Lazy-Backfill: Quotes die VOR dem Acceptance-Feature angelegt wurden,
  // haben noch keinen acceptToken. Wir generieren ihn beim ersten PDF-Aufruf,
  // damit der "Online annehmen"-Button im PDF auch für Alt-Bestand funktioniert.
  if (!quote.acceptToken) {
    const token = globalThis.crypto.randomUUID().replace(/-/g, "");
    await prisma.quote.update({
      where: { id: quote.id },
      data: { acceptToken: token },
    });
    quote.acceptToken = token;
  }

  // ===== Snapshot laden oder bei Alt-Angeboten aus Live-Daten bauen =====
  // Sobald ein Snapshot existiert, ist das Angebot unveränderlich — der
  // Kunde sieht immer die gleiche Version wie ursprünglich rausgeschickt,
  // unabhängig von späteren Änderungen am Projekt.
  const snapshot: DocumentSnapshot = isValidSnapshot(quote.snapshot)
    ? quote.snapshot
    : buildSnapshotFromProject(project, {
        vatPercent: liveSettings.vatPercent,
        companyName: liveSettings.companyName,
        companyStreet: liveSettings.companyStreet,
        companyZipCity: liveSettings.companyZipCity,
        dayFactorMap: liveSettings.dayFactorMap,
        quoteIntroText: liveSettings.quoteIntroText,
        quoteOutroText: liveSettings.quoteOutroText,
        pdfAccentColor: liveSettings.pdfAccentColor,
      });

  // Aliasse aus dem Snapshot — der Render-Code unten wird damit lesbarer.
  const days = snapshot.days;
  const factor = snapshot.factor;
  const isSale = snapshot.isSale;
  const factorLabel = isSale ? "" : `${days} (${String(factor).replace(".", ",")})`;
  const snapCustomer = snapshot.customer;
  const snapMaintainer = snapshot.maintainer;
  const projectName = snapshot.project.name;
  const projectKind = snapshot.project.kind;
  const snapBillingPeriods = snapshot.project.billingPeriods.map((p) => ({
    start: new Date(p.start),
    end: new Date(p.end),
  }));
  const snapMaterialDiscountPercent = snapshot.project.materialDiscountPercent;
  const snapServicesDiscountPercent = snapshot.project.servicesDiscountPercent;
  const snapProjectDiscountPercent = snapshot.project.discountPercent;
  const snapVatPercent = snapshot.settings.vatPercent;
  const snapCompanyName = snapshot.settings.companyName;
  const snapCompanyStreet = snapshot.settings.companyStreet;
  const snapCompanyZipCity = snapshot.settings.companyZipCity;
  const snapQuoteIntroText = snapshot.settings.quoteIntroText;
  const snapQuoteOutroText = snapshot.settings.quoteOutroText;

  // Material/Service-Gruppen + Maps aus dem Snapshot herleiten.
  const materialGroups = snapshot.groups.filter((g) => g.kind === "MATERIAL");
  const serviceGroups = snapshot.groups.filter((g) => g.kind === "SERVICE");
  type MaterialRow = DocumentSnapshot["groups"][number]["materialRows"][number];
  type AdHocRow = DocumentSnapshot["groups"][number]["adHocRows"][number];
  type CommentRow = DocumentSnapshot["groups"][number]["comments"][number];
  type ServiceRow = DocumentSnapshot["groups"][number]["serviceRows"][number];
  const materialByGroup = new Map<string, MaterialRow[]>();
  const adHocByGroup = new Map<string, AdHocRow[]>();
  const commentsByGroup = new Map<string, CommentRow[]>();
  const servicesByGroup = new Map<string, ServiceRow[]>();
  for (const g of snapshot.groups) {
    if (g.materialRows.length > 0) materialByGroup.set(g.id, g.materialRows);
    if (g.adHocRows.length > 0) adHocByGroup.set(g.id, g.adHocRows);
    if (g.comments.length > 0) commentsByGroup.set(g.id, g.comments);
    if (g.serviceRows.length > 0) servicesByGroup.set(g.id, g.serviceRows);
  }

  // ===== Berechnungen — identisch zur Snapshot-Builder-Logik =====
  // AdHoc-Positionen werden wie Geräte mit dem Tagesfaktor multipliziert,
  // damit Zeilenbetrag und Zwischensumme zusammenpassen.
  const groupNetMap = new Map<string, { sub: number; disc: number; net: number }>();
  for (const g of materialGroups) {
    // Tagesfaktor pro Gruppe (Migration 25) — Alt-Snapshots ohne g.factor
    // fallen auf den globalen Faktor zurück.
    const gFactor = g.factor ?? factor;
    const subDevices = g.materialRows.reduce(
      (s, r) => s + r.dailyRate * r.quantity * gFactor,
      0,
    );
    const subAdHoc = g.adHocRows.reduce(
      (s, r) => s + r.unitPrice * r.quantity * gFactor,
      0,
    );
    const sub = subDevices + subAdHoc;
    const disc = (sub * g.discountPercent) / 100;
    groupNetMap.set(g.id, { sub, disc, net: sub - disc });
  }
  for (const g of serviceGroups) {
    const sub = g.serviceRows.reduce((s, r) => s + r.quantity * r.price, 0);
    const disc = (sub * g.discountPercent) / 100;
    groupNetMap.set(g.id, { sub, disc, net: sub - disc });
  }

  const materialBereichSub = materialGroups.reduce(
    (s, g) => s + (groupNetMap.get(g.id)?.net ?? 0),
    0,
  );
  const servicesBereichSub = serviceGroups.reduce(
    (s, g) => s + (groupNetMap.get(g.id)?.net ?? 0),
    0,
  );
  const materialBereichDisc =
    (materialBereichSub * snapMaterialDiscountPercent) / 100;
  const servicesBereichDisc =
    (servicesBereichSub * snapServicesDiscountPercent) / 100;
  const materialBereichNet = materialBereichSub - materialBereichDisc;
  const servicesBereichNet = servicesBereichSub - servicesBereichDisc;

  // Brutto-Summen der Bereiche (vor allen Rabatten). Die Bereichs-Zwischensumme
  // in der Tabelle zeigt diesen Wert — alle Rabatte stehen gesammelt in der
  // eigenen Sektion „Rabatte" am Ende der Tabelle.
  const materialBereichGross = materialGroups.reduce(
    (s, g) => s + (groupNetMap.get(g.id)?.sub ?? 0),
    0,
  );
  const servicesBereichGross = serviceGroups.reduce(
    (s, g) => s + (groupNetMap.get(g.id)?.sub ?? 0),
    0,
  );
  const materialGroupDisc = materialGroups.reduce(
    (s, g) => s + (groupNetMap.get(g.id)?.disc ?? 0),
    0,
  );
  const servicesGroupDisc = serviceGroups.reduce(
    (s, g) => s + (groupNetMap.get(g.id)?.disc ?? 0),
    0,
  );
  // Summe aller Rabatte — Brutto der Bereiche minus diese Summe ergibt genau
  // `subAfterAll`, die Tabelle bleibt also nachrechenbar.
  const totalDiscounts =
    materialGroupDisc +
    servicesGroupDisc +
    materialBereichDisc +
    servicesBereichDisc;

  const subAfterAll = materialBereichNet + servicesBereichNet;
  const projectDiscount = (subAfterAll * snapProjectDiscountPercent) / 100;
  const totalNet = subAfterAll - projectDiscount;
  const vatPercent = snapVatPercent;
  const vatAmount = (totalNet * vatPercent) / 100;
  const totalGross = totalNet + vatAmount;

  // ===== PDF erstellen =====
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  setupGeistFont(doc);
  // Aktive Schrift nach dem Laden abgreifen ("Geist", oder "helvetica" als
  // Fallback falls die TTFs nicht gefunden wurden). autoTable erbt die
  // Dokument-Schrift NICHT automatisch — ohne explizites `font` in den styles
  // würden die Tabellen im Default Helvetica statt in Geist rendern.
  const BODY_FONT = doc.getFont().fontName;

  const ADDR_X = 20;
  const SENDER_Y = 45;
  const RECIPIENT_Y = 50;

  const senderLine = [snapCompanyName, snapCompanyStreet, snapCompanyZipCity]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" · ");
  if (senderLine) {
    doc.setFontSize(7);
    doc.setTextColor(80);
    doc.text(senderLine, ADDR_X, SENDER_Y);
    doc.setTextColor(0);
  }

  doc.setFontSize(11);
  const recipientLines: string[] = [];
  if (snapCustomer) {
    if (snapCustomer.name) recipientLines.push(snapCustomer.name);
    if (snapCustomer.contactPerson) recipientLines.push(snapCustomer.contactPerson);
    if (snapCustomer.address) {
      for (const l of snapCustomer.address.split(/\r?\n/)) {
        const t = l.trim();
        if (t) recipientLines.push(t);
      }
    }
  }
  recipientLines.slice(0, 6).forEach((line, i) => {
    doc.text(line, ADDR_X, RECIPIENT_Y + i * 5);
  });

  doc.setFontSize(14);
  doc.setFont(undefined as unknown as string, "bold");
  doc.text(`Angebot ${quote.number}`, ADDR_X, 95);
  doc.setFont(undefined as unknown as string, "normal");
  doc.setFontSize(10);
  let metaY = 102;
  doc.text(`Angebotsdatum: ${quote.date.toLocaleDateString("de-DE")}`, ADDR_X, metaY);
  metaY += 5;
  doc.text(`Gültig bis: ${quote.expiresAt.toLocaleDateString("de-DE")}`, ADDR_X, metaY);
  metaY += 5;
  // Seitenbreite und rechter Rand — für den Auto-Umbruch der Projekt- und
  // Mietzeitraum-Zeile, falls Name bzw. Zeiträume nicht in eine Zeile passen.
  const PAGE_WIDTH = doc.internal.pageSize.getWidth();
  const TEXT_RIGHT_MARGIN = 14;
  const textWidth = PAGE_WIDTH - ADDR_X - TEXT_RIGHT_MARGIN;
  // Lange Projektnamen umbrechen; Folgezeilen bündig unter dem Wert.
  metaY = drawLabeledWrappedText(
    doc,
    "Projekt: ",
    `${projectName} (${projectKindLabel(projectKind as Parameters<typeof projectKindLabel>[0])})`,
    ADDR_X,
    metaY,
    textWidth
  );
  metaY += 5;
  if (!isSale) {
    // Ein Zeitraum, der komplett auf einem Tag liegt, wird als einzelnes
    // Datum gerendert statt „24.07.2026 – 24.07.2026" — das wirkt sauberer,
    // besonders bei vielen einzelnen Kalendertagen (z.B. Vermietungen über
    // mehrere Wochenenden).
    const formatPeriod = (p: (typeof snapBillingPeriods)[number]): string => {
      const s = p.start.toLocaleDateString("de-DE");
      const e = p.end.toLocaleDateString("de-DE");
      return s === e ? s : `${s} – ${e}`;
    };
    const periodsText =
      snapBillingPeriods.length === 1
        ? formatPeriod(snapBillingPeriods[0])
        : snapBillingPeriods.map(formatPeriod).join(" | ");
    // Bei vielen Zeiträumen kann der Text über den Rand hinauslaufen —
    // dann automatisch umbrechen, Folgezeilen bündig unter dem Wert.
    metaY = drawLabeledWrappedText(
      doc,
      "Mietzeitraum: ",
      `${periodsText} (${days} Tage)`,
      ADDR_X,
      metaY,
      textWidth
    );
  }

  // ===== Einleitungstext vor der Tabelle =====
  // Wurde beim Anlegen aus den Einstellungen ins Snapshot übernommen.
  const INTRO_TEXT = snapQuoteIntroText;

  let introY = metaY + 12;
  doc.setFontSize(10);
  doc.setFont(undefined as unknown as string, "normal");
  const introLines = INTRO_TEXT
    ? (doc.splitTextToSize(INTRO_TEXT, textWidth) as string[])
    : [];
  for (const line of introLines) {
    doc.text(line, ADDR_X, introY);
    introY += 5;
  }

  const tableStartY = (introLines.length > 0 ? introY + 6 : metaY + 10);

  // ===== Eine große Tabelle für alles =====
  // Spalten: Bezeichnung | Menge | €/Einheit | Tage | Summe
  const body: RowInput[] = [];

  // Helfer für gestylte Rows
  function row(
    label: string,
    qty: string,
    price: string,
    days: string,
    sum: string,
    opts: {
      bold?: boolean;
      bg?: [number, number, number];
      lighter?: boolean;
      white?: boolean;
      fontSize?: number;
    } = {}
  ): RowInput {
    const styles: Record<string, unknown> = {};
    if (opts.bold) styles.fontStyle = "bold";
    if (opts.bg) styles.fillColor = opts.bg;
    if (opts.lighter) styles.textColor = 110;
    if (opts.white) styles.textColor = 255;
    if (opts.fontSize) styles.fontSize = opts.fontSize;
    return [
      { content: label, styles },
      { content: qty, styles: { ...styles, halign: "right" } },
      { content: price, styles: { ...styles, halign: "right" } },
      { content: days, styles: { ...styles, halign: "right" } },
      { content: sum, styles: { ...styles, halign: "right" } },
    ];
  }

  const SECTION_FONT_SIZE = 12;

  // Gruppen-Header und Gruppen-Zwischensummen liegen leicht grau, die Bereiche
  // („Material", „Personal & Transport", „Rabatte") in der Akzentfarbe —
  // jeweils inklusive ihrer Zwischensumme.
  const GROUP_BG: [number, number, number] = [220, 220, 220];
  const GROUP_TOTAL_BG: [number, number, number] = [235, 235, 235];
  const GROUP_LINE: [number, number, number] = [190, 190, 190];
  // Akzentfarbe für die Bereichs-Zeilen (Header + Zwischensumme). Wird
  // pro Dokument im Snapshot konserviert, sodass alte PDFs ihre Farbe behalten.
  const ACCENT_RGB = parseHexColor(snapshot.settings.pdfAccentColor);

  function groupHeaderRow(name: string): RowInput {
    return [
      {
        content: INDENT_1 + name,
        colSpan: 5,
        styles: {
          fontStyle: "bold" as const,
          fontSize: 11,
          fillColor: GROUP_BG,
          cellPadding: { top: 3, bottom: 3, left: 2, right: 2 },
        },
      },
    ];
  }

  /**
   * Bereichs-Zeile in der Akzentfarbe — sowohl für den Bereichs-Header
   * („Material") als auch für dessen Zwischensumme.
   */
  function sectionRow(
    label: string,
    sum: string,
    fontSize: number = SECTION_FONT_SIZE
  ): RowInput {
    return row(label, "", "", "", sum, {
      bold: true,
      bg: ACCENT_RGB,
      white: true,
      fontSize,
    });
  }

  function spacerRow(): RowInput {
    return [
      {
        content: "",
        colSpan: 5,
        styles: {
          cellPadding: { top: 2, bottom: 2, left: 0, right: 0 },
          fillColor: [255, 255, 255] as [number, number, number],
        },
      },
    ];
  }

  function subtotalRow(label: string, sum: string): RowInput {
    const labelStyles = {
      fontStyle: "bold" as const,
      fillColor: GROUP_TOTAL_BG,
      lineWidth: { top: 0.3 },
      lineColor: GROUP_LINE,
      cellPadding: { top: 2.5, bottom: 1.5, left: 2, right: 2 },
    };
    const rightStyles = { ...labelStyles, halign: "right" as const };
    return [
      { content: label, styles: labelStyles },
      { content: "", styles: rightStyles },
      { content: "", styles: rightStyles },
      { content: "", styles: rightStyles },
      { content: sum, styles: rightStyles },
    ];
  }

  const hasMaterial = materialGroups.some(
    (g) => g.materialRows.length > 0 || g.adHocRows.length > 0,
  );
  const hasServices = serviceGroups.some((g) => g.serviceRows.length > 0);

  // -------- Material --------
  if (hasMaterial) {
    body.push(sectionRow("Material", ""));

    for (const group of materialGroups) {
      const rows = materialByGroup.get(group.id) ?? [];
      const adHoc = adHocByGroup.get(group.id) ?? [];
      const comments = commentsByGroup.get(group.id) ?? [];
      if (rows.length === 0 && adHoc.length === 0 && comments.length === 0) continue;
      const info = groupNetMap.get(group.id)!;
      // Tagesfaktor/Label pro Gruppe — Alt-Snapshots nutzen den globalen Wert.
      const gFactor = group.factor ?? factor;
      const gDays = group.days ?? days;
      const gFactorLabel = isSale
        ? ""
        : `${gDays} (${String(gFactor).replace(".", ",")})`;

      body.push(groupHeaderRow(group.name));

      // Devices + AdHoc + Comments nach sortOrder gemischt
      type Mixed =
        | { kind: "DEVICE"; sortOrder: number; row: MaterialRow }
        | { kind: "ADHOC"; sortOrder: number; row: AdHocRow }
        | { kind: "COMMENT"; sortOrder: number; row: CommentRow };
      const mixed: Mixed[] = [
        ...rows.map((r) => ({ kind: "DEVICE" as const, sortOrder: r.sortOrder, row: r })),
        ...adHoc.map((r) => ({ kind: "ADHOC" as const, sortOrder: r.sortOrder, row: r })),
        ...comments.map((c) => ({ kind: "COMMENT" as const, sortOrder: c.sortOrder, row: c })),
      ].sort((a, b) => a.sortOrder - b.sortOrder);

      for (const item of mixed) {
        if (item.kind === "COMMENT") {
          body.push([
            {
              content: `${INDENT_2}${item.row.text}`,
              colSpan: 5,
              styles: {
                fontStyle: "bold",
                fontSize: 10,
                fillColor: [240, 240, 240] as [number, number, number],
                cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
              },
            },
          ]);
          continue;
        }
        if (item.kind === "DEVICE") {
          const r = item.row;
          const line = r.dailyRate * r.quantity * gFactor;
          const make = [r.manufacturer, r.model].filter(Boolean).join(" ");
          const label =
            make && make.toLowerCase() !== r.name.toLowerCase()
              ? `${INDENT_2}${r.name}\n${INDENT_2}${make}`
              : `${INDENT_2}${r.name}`;
          body.push(
            row(label, String(r.quantity), fmt(r.dailyRate), gFactorLabel, fmt(line))
          );
          if (r.description && r.description.trim()) {
            body.push([
              {
                content: `${INDENT_3}${r.description.trim()}`,
                colSpan: 5,
                styles: {
                  fontSize: 8,
                  textColor: 140,
                  cellPadding: { top: 0, bottom: 1.5, left: 2, right: 2 },
                },
              },
            ]);
          }
          continue;
        }
        // ADHOC — wie Geräte mit Tagesfaktor (bei Verkauf = 1).
        const r = item.row;
        const line = r.unitPrice * r.quantity * gFactor;
        body.push(
          row(
            `${INDENT_2}${r.name}`,
            String(r.quantity),
            fmt(r.unitPrice),
            gFactorLabel,
            fmt(line)
          )
        );
        if (r.description && r.description.trim()) {
          body.push([
            {
              content: `${INDENT_3}${r.description.trim()}`,
              colSpan: 5,
              styles: {
                fontSize: 8,
                textColor: 140,
                cellPadding: { top: 0, bottom: 1.5, left: 2, right: 2 },
              },
            },
          ]);
        }
      }
      body.push(subtotalRow(INDENT_2 + "Zwischensumme " + group.name, fmt(info.sub)));
      body.push(spacerRow());
    }

    body.push(
      sectionRow(INDENT_1 + "Zwischensumme Material", fmt(materialBereichGross), 11)
    );
  }

  // -------- Personal & Transport --------
  if (hasServices) {
    body.push(sectionRow("Personal & Transport", ""));

    for (const group of serviceGroups) {
      const items = servicesByGroup.get(group.id) ?? [];
      const comments = commentsByGroup.get(group.id) ?? [];
      if (items.length === 0 && comments.length === 0) continue;
      const info = groupNetMap.get(group.id)!;

      body.push(groupHeaderRow(group.name));

      // Services + Comments nach sortOrder gemischt
      type SMixed =
        | { kind: "SERVICE"; sortOrder: number; row: (typeof items)[number] }
        | { kind: "COMMENT"; sortOrder: number; row: CommentRow };
      const smixed: SMixed[] = [
        ...items.map((r) => ({ kind: "SERVICE" as const, sortOrder: r.sortOrder, row: r })),
        ...comments.map((c) => ({ kind: "COMMENT" as const, sortOrder: c.sortOrder, row: c })),
      ].sort((a, b) => a.sortOrder - b.sortOrder);

      for (const item of smixed) {
        if (item.kind === "COMMENT") {
          body.push([
            {
              content: `${INDENT_2}${item.row.text}`,
              colSpan: 5,
              styles: {
                fontStyle: "bold",
                fontSize: 10,
                fillColor: [240, 240, 240] as [number, number, number],
                cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
              },
            },
          ]);
          continue;
        }
        const r = item.row;
        const line = r.quantity * r.price;
        const label = `${INDENT_2}${r.name}\n${INDENT_2}${r.kind} · ${r.unit}`;
        body.push(
          row(
            label,
            r.quantity.toString().replace(".", ","),
            fmt(r.price),
            "—",
            fmt(line)
          )
        );
      }
      body.push(subtotalRow(INDENT_2 + "Zwischensumme " + group.name, fmt(info.sub)));
      body.push(spacerRow());
    }

    body.push(
      sectionRow(
        INDENT_1 + "Zwischensumme Personal & Transport",
        fmt(servicesBereichGross),
        11
      )
    );
  }

  // -------- Rabatte --------
  // Alle Rabatte stehen gesammelt am Ende der Tabelle, gruppiert nach Bereich.
  // Die Positionslisten oben bleiben dadurch frei von Rabatt-Zeilen.
  type DiscountEntry = { label: string; amount: number };
  const collectDiscounts = (
    groups: typeof materialGroups,
    bereichDisc: number,
    bereichLabel: string
  ): DiscountEntry[] => {
    const entries: DiscountEntry[] = [];
    for (const group of groups) {
      const info = groupNetMap.get(group.id);
      if (!info || info.disc <= 0) continue;
      entries.push({
        label: `${group.name} ${Number(group.discountPercent)}%`,
        amount: info.disc,
      });
    }
    if (bereichDisc > 0) entries.push({ label: bereichLabel, amount: bereichDisc });
    return entries;
  };
  const materialDiscounts = hasMaterial
    ? collectDiscounts(
        materialGroups,
        materialBereichDisc,
        `Material-Rabatt ${snapMaterialDiscountPercent}%`
      )
    : [];
  const servicesDiscounts = hasServices
    ? collectDiscounts(
        serviceGroups,
        servicesBereichDisc,
        `Personal-&-Transport-Rabatt ${snapServicesDiscountPercent}%`
      )
    : [];

  if (materialDiscounts.length > 0 || servicesDiscounts.length > 0) {
    body.push(spacerRow());
    body.push(sectionRow("Rabatte", ""));
    let firstDiscountGroup = true;
    const pushDiscountGroup = (name: string, entries: DiscountEntry[]) => {
      if (entries.length === 0) return;
      if (!firstDiscountGroup) body.push(spacerRow());
      firstDiscountGroup = false;
      body.push(groupHeaderRow(name));
      for (const entry of entries) {
        body.push(
          row(INDENT_2 + entry.label, "", "", "", "-" + fmt(entry.amount), {
            lighter: true,
          })
        );
      }
    };
    pushDiscountGroup("Material", materialDiscounts);
    pushDiscountGroup("Personal & Transport", servicesDiscounts);
    body.push(
      sectionRow(INDENT_1 + "Summe Rabatte", "-" + fmt(totalDiscounts), 11)
    );
  }

  autoTable(doc, {
    startY: tableStartY,
    head: [
      [
        { content: "Bezeichnung", styles: { halign: "left" } },
        { content: "Menge", styles: { halign: "right" } },
        { content: isSale ? "€ / Stück" : "€ / Einheit", styles: { halign: "right" } },
        { content: isSale ? "" : "Tage (Faktor)", styles: { halign: "right" } },
        { content: "Summe", styles: { halign: "right" } },
      ],
    ],
    body,
    theme: "plain",
    styles: { font: BODY_FONT, fontSize: 9, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 } },
    headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 18 },
      2: { cellWidth: 24 },
      3: { cellWidth: 22 },
      4: { cellWidth: 28 },
    },
    // Oben (Folgeseiten) und unten genug Platz für Briefpapier-Header/Footer reservieren
    margin: { top: 35, bottom: 55, left: 14, right: 14 },
  });

  // @ts-expect-error: lastAutoTable
  let totalsY = doc.lastAutoTable.finalY + 6;

  // ===== Totals (Projekt-Rabatt, Netto, MwSt, Brutto) =====
  const totalsBody: RowInput[] = [];
  if (projectDiscount > 0) {
    totalsBody.push([
      {
        content: `Projekt-Rabatt ${snapProjectDiscountPercent}%`,
        styles: { halign: "right" },
      },
      { content: "-" + fmt(projectDiscount), styles: { halign: "right" } },
    ]);
  }
  totalsBody.push([
    {
      content: "Gesamt netto",
      styles: { halign: "right", fontStyle: "bold" },
    },
    { content: fmt(totalNet), styles: { halign: "right", fontStyle: "bold" } },
  ]);
  if (vatPercent > 0) {
    totalsBody.push([
      {
        content: `zzgl. MwSt. ${vatPercent}%`,
        styles: { halign: "right" },
      },
      { content: fmt(vatAmount), styles: { halign: "right" } },
    ]);
    totalsBody.push([
      {
        content: "Gesamt brutto",
        styles: { halign: "right", fontStyle: "bold", fontSize: 11 },
      },
      {
        content: fmt(totalGross),
        styles: { halign: "right", fontStyle: "bold", fontSize: 11 },
      },
    ]);
  }

  // A4 ist 297 mm hoch. Briefpapier-Footer braucht ca. 55 mm unten.
  // Geschätzte Höhe für Totals-Block + Footer-Text:
  const PAGE_BOTTOM_RESERVED = 55;
  const PAGE_HEIGHT = 297;
  const totalsHeightEstimate = totalsBody.length * 6 + 18; // ~6mm pro Zeile + Footer-Text
  if (totalsY + totalsHeightEstimate > PAGE_HEIGHT - PAGE_BOTTOM_RESERVED) {
    doc.addPage();
    totalsY = 35;
  }

  autoTable(doc, {
    startY: totalsY,
    body: totalsBody,
    theme: "plain",
    styles: { font: BODY_FONT, fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 150 },
      1: { halign: "right" },
    },
    margin: { top: 35, bottom: 55, left: 14, right: 14 },
  });

  let endY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  if (endY > PAGE_HEIGHT - PAGE_BOTTOM_RESERVED) {
    doc.addPage();
    endY = 35;
  }

  // ===== Schlusstext mit Hinweis, AGB, Grüßen und Signatur =====
  // OUTRO_TEXT wurde beim Anlegen aus den Einstellungen ins Snapshot übernommen.
  const OUTRO_TEXT = snapQuoteOutroText;

  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.setFont(undefined as unknown as string, "normal");
  const outroWidth = PAGE_WIDTH - ADDR_X - 14;
  const noteText = quote.notes && quote.notes.trim() ? quote.notes.trim() : "";
  const noteLines = noteText
    ? (doc.splitTextToSize(noteText, outroWidth) as string[])
    : [];
  const outroLines = OUTRO_TEXT
    ? (doc.splitTextToSize(OUTRO_TEXT, outroWidth) as string[])
    : [];
  // Ab hier wird der Schlussblock (Hinweis, AGB-Text, Grüße, Signatur, Button)
  // manuell Zeile für Zeile gezeichnet — anders als die autoTable-Tabellen
  // darüber paginiert jsPDF das NICHT automatisch. Damit weder der Fließtext
  // noch der "Online annehmen"-Button in den Briefpapier-Footer laufen, prüfen
  // wir vor jedem Element via ensureSpace(), ob bis zum reservierten Footer-
  // Bereich noch genug Platz frei ist, und brechen sonst auf eine neue Seite um.
  const CONTENT_TOP = 35;
  let outroY = endY + 4;
  const ensureSpace = (needed: number) => {
    if (outroY + needed > PAGE_HEIGHT - PAGE_BOTTOM_RESERVED) {
      doc.addPage();
      outroY = CONTENT_TOP;
    }
  };

  // 1. Optionaler Hinweistext aus dem Dialog
  for (const line of noteLines) {
    ensureSpace(5);
    doc.text(line, ADDR_X, outroY);
    outroY += 5;
  }
  if (noteLines.length > 0) {
    outroY += 5;
  }
  // 2. Fester AGB-/Abschlusstext
  for (const line of outroLines) {
    ensureSpace(5);
    doc.text(line, ADDR_X, outroY);
    outroY += 5;
  }

  // 3. Grüße + Signatur + Button + Footer-Hinweis bilden einen zusammen-
  // hängenden Block, der nicht getrennt werden soll. Höhe vorab schätzen und
  // bei Bedarf komplett auf die nächste Seite umbrechen — so bleibt der Button
  // immer mit der Signatur zusammen und landet nie im Footer.
  const maintainerName =
    snapMaintainer?.name ||
    snapMaintainer?.email ||
    "";
  const companyName = (snapCompanyName || "PubliXound").trim();
  const acceptBlockHeight = quote.acceptedAt
    ? 8 // Bestätigungszeile
    : quote.acceptToken
      ? 12 + 10 // Button-Höhe + URL-Zeile darunter
      : 0;
  const SIGNATURE_BLOCK_HEIGHT =
    8 + // Abstand über "Mit freundlichen Grüßen"
    10 + // Grußzeile
    (maintainerName ? 5 : 0) +
    (companyName ? 5 : 0) +
    8 + // Abstand über Button/Bestätigung
    acceptBlockHeight +
    12; // Footer-Hinweis + unterer Rand
  ensureSpace(SIGNATURE_BLOCK_HEIGHT);

  // Mit freundlichen Grüßen + Projektverantwortlicher + Firmenname (eingerückt)
  outroY += 8;
  doc.text("Mit freundlichen Grüßen", ADDR_X, outroY);
  outroY += 10;
  const SIGNATURE_INDENT = ADDR_X + 6;
  if (maintainerName) {
    doc.setFont(undefined as unknown as string, "bold");
    doc.text(maintainerName, SIGNATURE_INDENT, outroY);
    outroY += 5;
    doc.setFont(undefined as unknown as string, "normal");
  }
  if (companyName) {
    doc.text(companyName, SIGNATURE_INDENT, outroY);
    outroY += 5;
  }

  // ===== Online-Annehmen-Button =====
  // Erscheint NUR wenn das Angebot noch nicht angenommen wurde und der
  // acceptToken vorhanden ist. Position: nach der Signatur, in Akzentfarbe.
  // Bei bereits angenommenen Quotes zeigen wir stattdessen einen dezenten
  // Hinweis mit Annahmedatum + Name.
  outroY += 8;
  if (quote.acceptedAt) {
    // Bestätigungs-Block: schon angenommen
    doc.setDrawColor(...ACCENT_RGB);
    doc.setLineWidth(0.4);
    doc.line(ADDR_X, outroY - 2, 196, outroY - 2);
    doc.setFontSize(9);
    doc.setTextColor(...ACCENT_RGB);
    const acceptedDate = quote.acceptedAt.toLocaleDateString("de-DE");
    const acceptedBy = quote.acceptedByName ?? "";
    doc.text(
      `Angenommen am ${acceptedDate}${acceptedBy ? ` von ${acceptedBy}` : ""}`,
      ADDR_X,
      outroY + 3,
    );
    doc.setTextColor(0);
    outroY += 8;
  } else if (quote.acceptToken) {
    // Klickbarer Button zum Online-Annehmen.
    //
    // Wichtig: KEIN bold setzen — Inter ist nur in Regular geladen, bold würde
    // synthetisch gefakt und die Char-Widths verschieben (Resultat: stark
    // verbreiterte Buchstabenabstände). Stattdessen normaler Stil, etwas
    // größer.
    //
    // Klickbarkeit via textWithLink statt rect + link — die Text-Annotation
    // ist robuster und immer mit dem sichtbaren Text deckungsgleich. Den
    // farbigen Hintergrund zeichnen wir trotzdem als visuelle Hervorhebung.
    const acceptUrl = `${baseUrl}/angebot/${quote.acceptToken}`;
    const BTN_X = ADDR_X;
    const BTN_Y = outroY;
    const BTN_W = 90;
    const BTN_H = 12;

    // Hintergrund (rein dekorativ)
    doc.setFillColor(...ACCENT_RGB);
    doc.rect(BTN_X, BTN_Y, BTN_W, BTN_H, "F");

    // Klickbarer Text — ohne Pfeil-Zeichen (das fehlt im Inter-Subset),
    // dafür mit deutlichen Wort.
    doc.setTextColor(255);
    doc.setFontSize(11);
    doc.textWithLink("Angebot online annehmen", BTN_X + 5, BTN_Y + 8, {
      url: acceptUrl,
    });

    // Zusätzlich noch das gesamte Rechteck klickbar machen, damit auch ein
    // Klick neben dem Text funktioniert.
    doc.link(BTN_X, BTN_Y, BTN_W, BTN_H, { url: acceptUrl });

    // URL als kleinen Text drunter — falls jemand das ausgedruckte PDF
    // in der Hand hat und den Link manuell abtippen muss.
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.textWithLink(acceptUrl, BTN_X, BTN_Y + BTN_H + 5, { url: acceptUrl });
    doc.setTextColor(0);
    outroY += BTN_H + 10;
  }

  endY = outroY;

  // Footer-Hinweis
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(
    `Dieses Angebot ist gültig bis zum ${quote.expiresAt.toLocaleDateString("de-DE")}.`,
    14,
    endY + 4
  );

  // ===== Seitenzahl auf jeder Seite ("Seite 1 von 4") =====
  // Wird nach Abschluss des Render-Loops über ALLE Seiten gestempelt, damit
  // die Gesamtanzahl korrekt ist. Position knapp oberhalb des Briefpapier-
  // Footers (ca. y = 240 mm), rechtsbündig in der Spaltenbreite.
  const totalPages = doc.getNumberOfPages();
  const PAGE_NUM_Y = 258;
  const PAGE_NUM_RIGHT_X = 196; // A4 = 210 mm, 14 mm Rand rechts
  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.setFont(undefined as unknown as string, "normal");
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.text(`Seite ${i} von ${totalPages}`, PAGE_NUM_RIGHT_X, PAGE_NUM_Y, {
      align: "right",
    });
  }

  // Letterhead-PDF darüberlegen (falls hinterlegt)
  const contentBytes = new Uint8Array(doc.output("arraybuffer"));
  const finalBytes = await applyLetterhead(contentBytes);

  const filename = buildDocumentPdfFilename(
    "Angebot",
    quote.number,
    snapCustomer?.name ?? null,
    projectName
  );

  return { bytes: finalBytes, filename, quote };
}
