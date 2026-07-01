import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { jsPDF } from "jspdf";
import autoTable, { RowInput } from "jspdf-autotable";
import { projectKindLabel } from "@/lib/labels";
import { applyLetterhead } from "@/lib/letterhead";
import { buildDocumentPdfFilename } from "@/lib/utils";
import { getSettings, parseHexColor } from "@/lib/settings";
import { setupGeistFont } from "@/lib/pdf-fonts";
import {
  buildSnapshotFromProject,
  isValidSnapshot,
  type DocumentSnapshot,
} from "@/lib/document-snapshot";

const fmt = (n: number) => n.toFixed(2).replace(".", ",") + " €";
const INDENT_1 = "    "; // Bereich
const INDENT_2 = "        "; // Gruppe
const INDENT_3 = "            "; // Item

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string; quoteId: string }> }
) {
  const session = await auth();
  const url = new URL(req.url);
  // ?download=1 forciert den Download statt der Inline-Anzeige.
  const download = url.searchParams.get("download") === "1";
  // ?token=XXX erlaubt den Public-Zugriff auf das Quote-PDF (für die
  // /angebot/<token>/pdf-Route). Der Token wird unten gegen den
  // gespeicherten quote.acceptToken validiert; passt er nicht, geben wir
  // 403 zurück. Ohne Token UND ohne Session → 401.
  const publicToken = url.searchParams.get("token");
  if (!session && !publicToken) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id, quoteId } = await props.params;
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      project: {
        include: {
          customer: true,
          billingPeriods: { orderBy: { start: "asc" } },
          groups: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] },
          assignments: {
            include: { device: true },
          },
          services: { include: { serviceItem: true } },
          adHocItems: { orderBy: { sortOrder: "asc" } },
          groupComments: { orderBy: { sortOrder: "asc" } },
          maintainer: { select: { name: true, email: true } },
        },
      },
    },
  });
  if (!quote || quote.projectId !== id) {
    return new NextResponse("Not found", { status: 404 });
  }
  // Token-Validierung für den Public-Zugriff: wenn KEINE Session und ein
  // Token vorhanden ist, muss der Token zum Quote passen. Sonst 403.
  if (!session && publicToken && quote.acceptToken !== publicToken) {
    return new NextResponse("Forbidden", { status: 403 });
  }
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
    const subDevices = g.materialRows.reduce(
      (s, r) => s + r.dailyRate * r.quantity * factor,
      0,
    );
    const subAdHoc = g.adHocRows.reduce(
      (s, r) => s + r.unitPrice * r.quantity * factor,
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

  const subAfterAll = materialBereichNet + servicesBereichNet;
  const projectDiscount = (subAfterAll * snapProjectDiscountPercent) / 100;
  const totalNet = subAfterAll - projectDiscount;
  const vatPercent = snapVatPercent;
  const vatAmount = (totalNet * vatPercent) / 100;
  const totalGross = totalNet + vatAmount;

  // ===== PDF erstellen =====
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  setupGeistFont(doc);

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
  doc.text(
    `Projekt: ${projectName} (${projectKindLabel(projectKind as Parameters<typeof projectKindLabel>[0])})`,
    ADDR_X,
    metaY
  );
  metaY += 5;
  // Seitenbreite und rechter Rand — auch für Auto-Umbruch der
  // Mietzeitraum-Zeile benötigt, falls mehrere Zeiträume in einer Zeile
  // nicht mehr passen.
  const PAGE_WIDTH = doc.internal.pageSize.getWidth();
  const TEXT_RIGHT_MARGIN = 14;
  const textWidth = PAGE_WIDTH - ADDR_X - TEXT_RIGHT_MARGIN;
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
    // splitTextToSize bricht ihn dann auf mehrere Zeilen um. Folgezeilen
    // werden leicht eingerückt, damit das Label „Mietzeitraum:" optisch
    // klar von den Fortsetzungen getrennt ist.
    const fullLine = `Mietzeitraum: ${periodsText} (${days} Tage)`;
    const periodLines = doc.splitTextToSize(fullLine, textWidth) as string[];
    for (let i = 0; i < periodLines.length; i++) {
      doc.text(periodLines[i], ADDR_X, metaY);
      if (i < periodLines.length - 1) metaY += 5;
    }
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
      fontSize?: number;
    } = {}
  ): RowInput {
    const styles: Record<string, unknown> = {};
    if (opts.bold) styles.fontStyle = "bold";
    if (opts.bg) styles.fillColor = opts.bg;
    if (opts.lighter) styles.textColor = 110;
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

  const SECTION_BG: [number, number, number] = [220, 220, 220];
  const TOTAL_BG: [number, number, number] = [232, 232, 232];
  // Akzentfarbe für Gruppen-Header + Trennstrich über Zwischensumme. Wird
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
          fillColor: ACCENT_RGB,
          textColor: 255,
          cellPadding: { top: 3, bottom: 3, left: 2, right: 2 },
        },
      },
    ];
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
      lineWidth: { top: 0.6 },
      lineColor: ACCENT_RGB,
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
    body.push(
      row("Material", "", "", "", "", {
        bold: true,
        bg: SECTION_BG,
        fontSize: SECTION_FONT_SIZE,
      })
    );

    for (const group of materialGroups) {
      const rows = materialByGroup.get(group.id) ?? [];
      const adHoc = adHocByGroup.get(group.id) ?? [];
      const comments = commentsByGroup.get(group.id) ?? [];
      if (rows.length === 0 && adHoc.length === 0 && comments.length === 0) continue;
      const info = groupNetMap.get(group.id)!;

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
          const line = r.dailyRate * r.quantity * factor;
          const make = [r.manufacturer, r.model].filter(Boolean).join(" ");
          const label =
            make && make.toLowerCase() !== r.name.toLowerCase()
              ? `${INDENT_2}${r.name}\n${INDENT_2}${make}`
              : `${INDENT_2}${r.name}`;
          body.push(
            row(label, String(r.quantity), fmt(r.dailyRate), factorLabel, fmt(line))
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
        const line = r.unitPrice * r.quantity * factor;
        body.push(
          row(
            `${INDENT_2}${r.name}`,
            String(r.quantity),
            fmt(r.unitPrice),
            factorLabel,
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
      if (info.disc > 0) {
        body.push(
          row(
            INDENT_2 + `Rabatt ${Number(group.discountPercent)}%`,
            "",
            "",
            "",
            "-" + fmt(info.disc),
            { lighter: true }
          )
        );
      }
      body.push(spacerRow());
    }

    if (snapMaterialDiscountPercent > 0) {
      body.push(
        row(
          INDENT_1 + `Material-Rabatt ${snapMaterialDiscountPercent}%`,
          "",
          "",
          "",
          "-" + fmt(materialBereichDisc),
          { lighter: true }
        )
      );
    }
    body.push(
      row(INDENT_1 + "Zwischensumme Material", "", "", "", fmt(materialBereichNet), {
        bold: true,
        bg: TOTAL_BG,
      })
    );
  }

  // -------- Personal & Transport --------
  if (hasServices) {
    body.push(
      row("Personal & Transport", "", "", "", "", {
        bold: true,
        bg: SECTION_BG,
        fontSize: SECTION_FONT_SIZE,
      })
    );

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
      if (info.disc > 0) {
        body.push(
          row(
            INDENT_2 + `Rabatt ${Number(group.discountPercent)}%`,
            "",
            "",
            "",
            "-" + fmt(info.disc),
            { lighter: true }
          )
        );
      }
      body.push(spacerRow());
    }

    if (snapServicesDiscountPercent > 0) {
      body.push(
        row(
          INDENT_1 + `Personal-&-Transport-Rabatt ${snapServicesDiscountPercent}%`,
          "",
          "",
          "",
          "-" + fmt(servicesBereichDisc),
          { lighter: true }
        )
      );
    }
    body.push(
      row(
        INDENT_1 + "Zwischensumme Personal & Transport",
        "",
        "",
        "",
        fmt(servicesBereichNet),
        { bold: true, bg: TOTAL_BG }
      )
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
    styles: { fontSize: 9, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 } },
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
    styles: { fontSize: 10 },
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
  // Seitenumbruch falls Hinweis + Schlusstext + Signatur nicht mehr passen
  const REQUIRED_FOR_OUTRO =
    (noteLines.length > 0 ? noteLines.length * 5 + 5 : 0) +
    outroLines.length * 5 +
    32;
  if (endY + REQUIRED_FOR_OUTRO > PAGE_HEIGHT - PAGE_BOTTOM_RESERVED) {
    doc.addPage();
    endY = 35;
  }
  let outroY = endY + 4;
  // 1. Optionaler Hinweistext aus dem Dialog
  for (const line of noteLines) {
    doc.text(line, ADDR_X, outroY);
    outroY += 5;
  }
  if (noteLines.length > 0) {
    outroY += 5;
  }
  // 2. Fester AGB-/Abschlusstext
  for (const line of outroLines) {
    doc.text(line, ADDR_X, outroY);
    outroY += 5;
  }

  // Mit freundlichen Grüßen + Projektverantwortlicher + Firmenname (eingerückt)
  outroY += 8;
  doc.text("Mit freundlichen Grüßen", ADDR_X, outroY);
  outroY += 10;
  const SIGNATURE_INDENT = ADDR_X + 6;
  const maintainerName =
    snapMaintainer?.name ||
    snapMaintainer?.email ||
    "";
  if (maintainerName) {
    doc.setFont(undefined as unknown as string, "bold");
    doc.text(maintainerName, SIGNATURE_INDENT, outroY);
    outroY += 5;
    doc.setFont(undefined as unknown as string, "normal");
  }
  const companyName = (snapCompanyName || "PubliXound").trim();
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
    const acceptUrl = `${new URL(req.url).origin}/angebot/${quote.acceptToken}`;
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
  return new NextResponse(finalBytes as BodyInit, {
    headers: {
      // iOS Safari ignoriert Content-Disposition: attachment bei application/pdf
      // und öffnet das Dokument trotzdem inline im Viewer. Für Downloads senden
      // wir deshalb application/octet-stream — dann landet die Datei sicher im
      // Download-Ordner statt im PDF-Viewer.
      "Content-Type": download ? "application/octet-stream" : "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
