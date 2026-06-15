import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { jsPDF } from "jspdf";
import autoTable, { RowInput } from "jspdf-autotable";
import { projectKindLabel } from "@/lib/labels";
import { applyLetterhead } from "@/lib/letterhead";
import { buildDocumentPdfFilename } from "@/lib/utils";
import { getSettings, parseHexColor } from "@/lib/settings";
import { setupInterFont } from "@/lib/pdf-fonts";
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
  props: { params: Promise<{ id: string; invoiceId: string }> }
) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id, invoiceId } = await props.params;
  // ?download=1 forciert den Download — wird beim frischen Erstellen genutzt,
  // damit das PDF direkt im Download-Ordner landet statt im Browser-Viewer.
  const download = new URL(req.url).searchParams.get("download") === "1";
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      relatedInvoice: {
        select: { number: true, date: true, dueDate: true, totalGross: true, totalNet: true },
      },
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
  if (!invoice || invoice.projectId !== id) {
    return new NextResponse("Not found", { status: 404 });
  }
  const project = invoice.project;
  const liveSettings = await getSettings();

  // ===== Snapshot laden oder bei Alt-Rechnungen aus Live-Daten bauen =====
  // Sobald ein Snapshot gespeichert ist, ist die Rechnung unveränderlich —
  // spätere Projekt-Änderungen verändern das PDF nicht mehr (GoBD-konform).
  // Bei Alt-Bestand ohne Snapshot (vor Einführung dieses Features) bauen wir
  // den Snapshot just-in-time aus den Live-Daten.
  const snapshot: DocumentSnapshot = isValidSnapshot(invoice.snapshot)
    ? invoice.snapshot
    : buildSnapshotFromProject(project, {
        vatPercent: liveSettings.vatPercent,
        companyName: liveSettings.companyName,
        companyStreet: liveSettings.companyStreet,
        companyZipCity: liveSettings.companyZipCity,
        dayFactorMap: liveSettings.dayFactorMap,
        quoteIntroText: null,
        quoteOutroText: null,
        pdfAccentColor: liveSettings.pdfAccentColor,
      });

  // Aliasse aus dem Snapshot, damit der nachfolgende Render-Code lesbar bleibt.
  const days = snapshot.days;
  const factor = snapshot.factor;
  const isSale = snapshot.isSale;
  const factorLabel = isSale ? "" : `${days} (${String(factor).replace(".", ",")})`;
  const snapCustomer = snapshot.customer;
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

  // Material/Service-Gruppen + Maps aus dem Snapshot herleiten — Form passt
  // 1:1 zur ursprünglichen Render-Logik, die diese Maps konsumiert.
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
  setupInterFont(doc);

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

  const docTitle =
    invoice.kind === "REMINDER"
      ? invoice.reminderLevel > 1
        ? `${invoice.reminderLevel}. Mahnung ${invoice.number}`
        : `Mahnung ${invoice.number}`
      : `Rechnung ${invoice.number}`;
  doc.setFontSize(14);
  doc.setFont(undefined as unknown as string, "bold");
  doc.text(docTitle, ADDR_X, 95);
  doc.setFont(undefined as unknown as string, "normal");
  doc.setFontSize(10);
  let metaY = 102;
  const dateLabel =
    invoice.kind === "REMINDER" ? "Mahndatum" : "Rechnungsdatum";
  doc.text(
    `${dateLabel}: ${invoice.date.toLocaleDateString("de-DE")}`,
    ADDR_X,
    metaY
  );
  metaY += 5;
  if (invoice.kind === "REMINDER" && invoice.relatedInvoice) {
    doc.text(
      `Zur Rechnung: ${invoice.relatedInvoice.number} vom ${invoice.relatedInvoice.date.toLocaleDateString("de-DE")}`,
      ADDR_X,
      metaY
    );
    metaY += 5;
  }
  // Bei Vorkasse-Rechnungen wird statt eines Datums der Text „Vorkasse"
  // ausgegeben.
  const dueValue =
    invoice.kind === "INVOICE" && invoice.isPrepayment
      ? "Vorkasse"
      : invoice.dueDate.toLocaleDateString("de-DE");
  doc.text(`Zahlbar bis: ${dueValue}`, ADDR_X, metaY);
  metaY += 5;
  doc.text(
    `Projekt: ${projectName} (${projectKindLabel(projectKind as Parameters<typeof projectKindLabel>[0])})`,
    ADDR_X,
    metaY
  );
  metaY += 5;
  if (!isSale) {
    const periodsText =
      snapBillingPeriods.length === 1
        ? `${snapBillingPeriods[0].start.toLocaleDateString("de-DE")} – ${snapBillingPeriods[0].end.toLocaleDateString("de-DE")}`
        : snapBillingPeriods
            .map(
              (p, i) =>
                `${i + 1}. ${p.start.toLocaleDateString("de-DE")} – ${p.end.toLocaleDateString("de-DE")}`
            )
            .join(" | ");
    doc.text(`Mietzeitraum: ${periodsText} (${days} Tage)`, ADDR_X, metaY);
  }

  const tableStartY = metaY + (isSale ? 5 : 10);

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

  /**
   * Header-Zeile für eine Gruppe — kräftig in der Akzentfarbe, weißer Text,
   * etwas größer als die Item-Zeilen, mit extra vertikalem Padding, damit
   * die Gruppe optisch klar von der vorhergehenden Gruppe abgegrenzt ist.
   */
  function groupHeaderRow(name: string): RowInput {
    return [
      {
        content: INDENT_1 + name,
        colSpan: 5,
        styles: {
          fontStyle: "bold",
          fontSize: 11,
          fillColor: ACCENT_RGB,
          textColor: 255,
          cellPadding: { top: 3, bottom: 3, left: 2, right: 2 },
        },
      },
    ];
  }

  /**
   * Leerzeile, die als visueller Abstand am Ende einer Gruppe eingefügt wird.
   * colSpan über alle Spalten, minimale Höhe via cellPadding.
   */
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

  /**
   * Zwischensummen-Zeile mit Trennstrich oberhalb in Akzentfarbe.
   * Nutzt autoTable-Per-Zelle-Border (lineWidth.top + lineColor).
   */
  function subtotalRow(label: string, sum: string): RowInput {
    const labelStyles = {
      fontStyle: "bold",
      lineWidth: { top: 0.6 },
      lineColor: ACCENT_RGB,
      cellPadding: { top: 2.5, bottom: 1.5, left: 2, right: 2 },
    };
    const rightStyles = { ...labelStyles, halign: "right" };
    return [
      { content: label, styles: labelStyles },
      { content: "", styles: rightStyles },
      { content: "", styles: rightStyles },
      { content: "", styles: rightStyles },
      { content: sum, styles: rightStyles },
    ];
  }

  // Hat das Dokument überhaupt Material-/Service-Inhalt? Wird aus Snapshot
  // abgeleitet, damit der Bereich-Header („Material" / „Personal & Transport")
  // nur erscheint, wenn auch wirklich Zeilen drunter stehen.
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

      // Devices + AdHoc + Comments in einer geordneten Liste nach sortOrder.
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
          // Kommentar-Zeile als gespannte, fette Zwischenüberschrift
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
      // Visueller Abstand zur nächsten Gruppe — macht die Trennung deutlicher.
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
      body.push(
        subtotalRow(INDENT_2 + "Zwischensumme " + group.name, fmt(info.sub))
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

  // Footer-Hinweis
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(
    "Zahlbar ohne Abzug innerhalb der angegebenen Frist auf das hinterlegte Konto.",
    14,
    endY + 4
  );

  // ===== Seitenzahl auf jeder Seite ("Seite 1 von 4") =====
  // Wird nach Abschluss des Render-Loops über ALLE Seiten gestempelt, damit
  // die Gesamtanzahl korrekt ist. Position knapp oberhalb des Briefpapier-
  // Footers (ca. y = 240 mm), zentriert in der Spaltenbreite.
  const totalPages = doc.getNumberOfPages();
  const PAGE_NUM_Y = 240;
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
    invoice.kind === "REMINDER" ? "Mahnung" : "Rechnung",
    invoice.number,
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
