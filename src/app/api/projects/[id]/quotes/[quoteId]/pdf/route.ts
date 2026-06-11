import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { jsPDF } from "jspdf";
import autoTable, { RowInput } from "jspdf-autotable";
import { daysBetween } from "@/lib/utils";
import { billingUnitLabel, serviceItemKindLabel } from "@/lib/labels";
import { applyLetterhead } from "@/lib/letterhead";
import { buildDocumentPdfFilename } from "@/lib/utils";
import { getSettings, parseDayFactorMap, getDayFactor } from "@/lib/settings";

const fmt = (n: number) => n.toFixed(2).replace(".", ",") + " €";
const INDENT_1 = "    "; // Bereich
const INDENT_2 = "        "; // Gruppe
const INDENT_3 = "            "; // Item

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string; quoteId: string }> }
) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id, quoteId } = await props.params;
  // ?download=1 forciert den Download statt der Inline-Anzeige.
  const download = new URL(req.url).searchParams.get("download") === "1";
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
          maintainer: { select: { name: true, email: true } },
        },
      },
    },
  });
  if (!quote || quote.projectId !== id) {
    return new NextResponse("Not found", { status: 404 });
  }
  const project = quote.project;
  const settings = await getSettings();

  const days = project.billingPeriods.reduce(
    (sum, p) => sum + daysBetween(p.start, p.end),
    0
  );
  const factor = getDayFactor(days, parseDayFactorMap(settings.dayFactorMap));
  const factorLabel = `${days} (${String(factor).replace(".", ",")})`;

  // ===== Material aggregieren pro Gruppe =====
  type MaterialRow = {
    name: string;
    manufacturer: string | null;
    model: string | null;
    description: string | null;
    dailyRate: number;
    quantity: number;
  };
  // Nicht-abrechenbare Gruppen werden auf Angeboten/Rechnungen komplett
  // weggelassen — weder in Tabellen noch in Summen oder Rabatten.
  const materialGroups = project.groups.filter(
    (g) => g.kind === "MATERIAL" && g.billable
  );
  const serviceGroups = project.groups.filter(
    (g) => g.kind === "SERVICE" && g.billable
  );
  const materialByGroup = new Map<string, MaterialRow[]>();
  for (const a of project.assignments) {
    // Geräte, die nicht auf Dokumenten erscheinen sollen, überspringen.
    // Berechnung erfolgt vorher zentral mit allen Geräten.
    if (!a.device.showOnDocuments) continue;
    const groupMap = materialByGroup.get(a.groupId) ?? ([] as MaterialRow[]);
    const lookup = new Map<string, MaterialRow>();
    for (const r of groupMap) {
      lookup.set(`${r.name}|${r.manufacturer}|${r.model}|${r.dailyRate}`, r);
    }
    const qty = a.quantity;
    const key = `${a.device.name}|${a.device.manufacturer}|${a.device.model}|${Number(a.device.dailyRate)}`;
    const existing = lookup.get(key);
    if (existing) existing.quantity += qty;
    else {
      const row: MaterialRow = {
        name: a.device.name,
        manufacturer: a.device.manufacturer,
        model: a.device.model,
        description: a.device.description,
        dailyRate: Number(a.device.dailyRate),
        quantity: qty,
      };
      lookup.set(key, row);
      groupMap.push(row);
    }
    materialByGroup.set(a.groupId, groupMap);
  }
  for (const arr of materialByGroup.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name, "de"));
  }

  // ===== Ad-hoc-Positionen pro Gruppe (Verkauf etc.) =====
  type AdHocRow = {
    name: string;
    description: string | null;
    unitPrice: number;
    quantity: number;
  };
  const adHocByGroup = new Map<string, AdHocRow[]>();
  for (const it of project.adHocItems) {
    const arr = adHocByGroup.get(it.groupId) ?? [];
    arr.push({
      name: it.name,
      description: it.description,
      unitPrice: Number(it.unitPrice),
      quantity: it.quantity,
    });
    adHocByGroup.set(it.groupId, arr);
  }
  for (const arr of adHocByGroup.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name, "de"));
  }

  // ===== Services pro Gruppe =====
  const servicesByGroup = new Map<
    string,
    { name: string; kind: string; unit: string; quantity: number; price: number }[]
  >();
  for (const ps of project.services) {
    const arr = servicesByGroup.get(ps.groupId) ?? [];
    arr.push({
      name: ps.serviceItem.name,
      kind: serviceItemKindLabel(ps.serviceItem.kind),
      unit: billingUnitLabel(ps.serviceItem.unit),
      quantity: Number(ps.quantity),
      price: ps.unitPriceOverride
        ? Number(ps.unitPriceOverride)
        : Number(ps.serviceItem.unitPrice),
    });
    servicesByGroup.set(ps.groupId, arr);
  }
  for (const arr of servicesByGroup.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name, "de"));
  }

  // ===== Berechnungen =====
  const groupNetMap = new Map<string, { sub: number; disc: number; net: number }>();
  for (const g of materialGroups) {
    const rows = materialByGroup.get(g.id) ?? [];
    const adHoc = adHocByGroup.get(g.id) ?? [];
    const subDevices = rows.reduce(
      (s, r) => s + r.dailyRate * r.quantity * factor,
      0
    );
    const subAdHoc = adHoc.reduce((s, r) => s + r.unitPrice * r.quantity, 0);
    const sub = subDevices + subAdHoc;
    const disc = (sub * Number(g.discountPercent)) / 100;
    groupNetMap.set(g.id, { sub, disc, net: sub - disc });
  }
  for (const g of serviceGroups) {
    const items = servicesByGroup.get(g.id) ?? [];
    const sub = items.reduce((s, r) => s + r.quantity * r.price, 0);
    const disc = (sub * Number(g.discountPercent)) / 100;
    groupNetMap.set(g.id, { sub, disc, net: sub - disc });
  }

  const materialBereichSub = materialGroups.reduce(
    (s, g) => s + (groupNetMap.get(g.id)?.net ?? 0),
    0
  );
  const servicesBereichSub = serviceGroups.reduce(
    (s, g) => s + (groupNetMap.get(g.id)?.net ?? 0),
    0
  );
  const materialBereichDisc =
    (materialBereichSub * Number(project.materialDiscountPercent)) / 100;
  const servicesBereichDisc =
    (servicesBereichSub * Number(project.servicesDiscountPercent)) / 100;
  const materialBereichNet = materialBereichSub - materialBereichDisc;
  const servicesBereichNet = servicesBereichSub - servicesBereichDisc;

  const subAfterAll = materialBereichNet + servicesBereichNet;
  const projectDiscount = (subAfterAll * Number(project.discountPercent)) / 100;
  const totalNet = subAfterAll - projectDiscount;
  const vatPercent = Number(settings.vatPercent) || 0;
  const vatAmount = (totalNet * vatPercent) / 100;
  const totalGross = totalNet + vatAmount;

  // ===== PDF erstellen =====
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const ADDR_X = 20;
  const SENDER_Y = 45;
  const RECIPIENT_Y = 50;

  const senderLine = [
    settings.companyName,
    settings.companyStreet,
    settings.companyZipCity,
  ]
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
  if (project.customer) {
    if (project.customer.name) recipientLines.push(project.customer.name);
    if (project.customer.contactPerson) recipientLines.push(project.customer.contactPerson);
    if (project.customer.address) {
      for (const l of project.customer.address.split(/\r?\n/)) {
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
  doc.text(`Projekt: ${project.name}`, ADDR_X, metaY);
  metaY += 5;
  const periodsText =
    project.billingPeriods.length === 1
      ? `${project.billingPeriods[0].start.toLocaleDateString("de-DE")} – ${project.billingPeriods[0].end.toLocaleDateString("de-DE")}`
      : project.billingPeriods
          .map(
            (p, i) =>
              `${i + 1}. ${p.start.toLocaleDateString("de-DE")} – ${p.end.toLocaleDateString("de-DE")}`
          )
          .join(" | ");
  doc.text(`Mietzeitraum: ${periodsText} (${days} Tage)`, ADDR_X, metaY);

  // ===== Einleitungstext vor der Tabelle =====
  // Aus den Einstellungen (Settings → Angebote → „Texte im Angebots-PDF").
  const INTRO_TEXT = (settings.quoteIntroText ?? "").trim();

  let introY = metaY + 12;
  doc.setFontSize(10);
  doc.setFont(undefined as unknown as string, "normal");
  // Auf maximal Seitenbreite umbrechen
  const PAGE_WIDTH = doc.internal.pageSize.getWidth();
  const TEXT_RIGHT_MARGIN = 14;
  const textWidth = PAGE_WIDTH - ADDR_X - TEXT_RIGHT_MARGIN;
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
  const GROUP_BG: [number, number, number] = [240, 240, 240];
  const TOTAL_BG: [number, number, number] = [232, 232, 232];

  const hasMaterial =
    project.assignments.length > 0 || project.adHocItems.length > 0;
  const hasServices = project.services.length > 0;

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
      if (rows.length === 0 && adHoc.length === 0) continue;
      const info = groupNetMap.get(group.id)!;

      body.push(
        row(INDENT_1 + group.name, "", "", "", "", { bold: true, bg: GROUP_BG })
      );
      for (const r of rows) {
        const line = r.dailyRate * r.quantity * factor;
        const make = [r.manufacturer, r.model].filter(Boolean).join(" ");
        // Make-Zeile nur, wenn sie zusätzliche Info bringt
        const label =
          make && make.toLowerCase() !== r.name.toLowerCase()
            ? `${INDENT_2}${r.name}\n${INDENT_2}${make}`
            : `${INDENT_2}${r.name}`;
        body.push(
          row(
            label,
            String(r.quantity),
            fmt(r.dailyRate),
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
      // Ad-hoc-Positionen — Stückpreis × Anzahl ohne Tagesfaktor
      for (const r of adHoc) {
        const line = r.unitPrice * r.quantity;
        body.push(
          row(
            `${INDENT_2}${r.name}`,
            String(r.quantity),
            fmt(r.unitPrice),
            "",
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
      body.push(
        row(INDENT_2 + "Zwischensumme " + group.name, "", "", "", fmt(info.sub), {
          bold: true,
        })
      );
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
    }

    if (Number(project.materialDiscountPercent) > 0) {
      body.push(
        row(
          INDENT_1 + `Material-Rabatt ${Number(project.materialDiscountPercent)}%`,
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
      if (items.length === 0) continue;
      const info = groupNetMap.get(group.id)!;

      body.push(
        row(INDENT_1 + group.name, "", "", "", "", { bold: true, bg: GROUP_BG })
      );
      for (const r of items) {
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
      body.push(
        row(INDENT_2 + "Zwischensumme " + group.name, "", "", "", fmt(info.sub), {
          bold: true,
        })
      );
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
    }

    if (Number(project.servicesDiscountPercent) > 0) {
      body.push(
        row(
          INDENT_1 + `Personal-&-Transport-Rabatt ${Number(project.servicesDiscountPercent)}%`,
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
        { content: "€ / Einheit", styles: { halign: "right" } },
        { content: "Tage (Faktor)", styles: { halign: "right" } },
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
        content: `Projekt-Rabatt ${Number(project.discountPercent)}%`,
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
  // OUTRO_TEXT aus den Einstellungen (Settings → Angebote).
  const OUTRO_TEXT = (settings.quoteOutroText ?? "").trim();

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
    project.maintainer?.name ||
    project.maintainer?.email ||
    "";
  if (maintainerName) {
    doc.setFont(undefined as unknown as string, "bold");
    doc.text(maintainerName, SIGNATURE_INDENT, outroY);
    outroY += 5;
    doc.setFont(undefined as unknown as string, "normal");
  }
  const companyName = (settings.companyName || "PubliXound").trim();
  if (companyName) {
    doc.text(companyName, SIGNATURE_INDENT, outroY);
    outroY += 5;
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

  // Letterhead-PDF darüberlegen (falls hinterlegt)
  const contentBytes = new Uint8Array(doc.output("arraybuffer"));
  const finalBytes = await applyLetterhead(contentBytes);

  const filename = buildDocumentPdfFilename(
    "Angebot",
    quote.number,
    project.customer?.name ?? null,
    project.name
  );
  return new NextResponse(finalBytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
