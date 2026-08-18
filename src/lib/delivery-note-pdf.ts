import { jsPDF } from "jspdf";
import autoTable, { RowInput } from "jspdf-autotable";
import { projectKindLabel } from "@/lib/labels";
import { applyLetterhead } from "@/lib/letterhead";
import { buildProjectPdfFilename } from "@/lib/utils";
import { getSettings, parseHexColor } from "@/lib/settings";
import { setupGeistFont } from "@/lib/pdf-fonts";
import { drawLabeledWrappedText } from "@/lib/pdf-text";
import { loadProjectPackList, type PackListProject } from "@/lib/packlist-data";

/**
 * Baut das Lieferschein-PDF für ein Projekt.
 *
 * Inhaltlich ist der Lieferschein identisch zur Packliste — er nutzt dieselbe
 * `loadProjectPackList()`-Basis, damit ausgeliefertes und gepacktes Material
 * nie auseinanderlaufen können: Packeinheiten mit Inhalt, lose Geräte und
 * Kabel, gruppiert nach Kategorie.
 *
 * Optisch ist er dagegen ein Kundendokument wie Angebot und Rechnung:
 * Geist-Schrift, Absender-/Empfängerblock, Akzentfarbe aus den Einstellungen,
 * Briefpapier und Seitenzahlen.
 *
 * Anders als Angebot/Rechnung wird der Lieferschein NICHT gespeichert und hat
 * bewusst keine Nummer — er wird bei jedem Download frisch aus dem aktuellen
 * Projektstand erzeugt (wie die Packliste).
 */
export interface BuiltDeliveryNotePdf {
  bytes: Uint8Array;
  filename: string;
  project: PackListProject;
}

export async function buildDeliveryNotePdf(
  projectId: string
): Promise<BuiltDeliveryNotePdf | null> {
  const data = await loadProjectPackList(projectId);
  if (!data) return null;
  const { project, groups, totals } = data;
  const settings = await getSettings();

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  setupGeistFont(doc);
  // autoTable erbt die Dokument-Schrift NICHT automatisch — ohne explizites
  // `font` in den styles würden die Tabellen im Default Helvetica rendern.
  const BODY_FONT = doc.getFont().fontName;

  const ADDR_X = 20;
  const SENDER_Y = 45;
  const RECIPIENT_Y = 50;
  const PAGE_WIDTH = doc.internal.pageSize.getWidth();
  const PAGE_HEIGHT = doc.internal.pageSize.getHeight();
  // Unterer Bereich bleibt für den Briefpapier-Footer reserviert.
  const PAGE_BOTTOM_RESERVED = 55;
  const TEXT_RIGHT_MARGIN = 14;
  const textWidth = PAGE_WIDTH - ADDR_X - TEXT_RIGHT_MARGIN;
  const ACCENT_RGB = parseHexColor(settings.pdfAccentColor);

  // ===== Absender-Einzeiler über dem Adressblock =====
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

  // ===== Empfänger: Kundenanschrift aus den Stammdaten =====
  doc.setFontSize(11);
  const recipientLines: string[] = [];
  if (project.customer) {
    if (project.customer.name) recipientLines.push(project.customer.name);
    if (project.customer.contactPerson) {
      recipientLines.push(project.customer.contactPerson);
    }
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

  // ===== Titel + Metadaten =====
  doc.setFontSize(14);
  doc.setFont(undefined as unknown as string, "bold");
  doc.text("Lieferschein", ADDR_X, 95);
  doc.setFont(undefined as unknown as string, "normal");
  doc.setFontSize(10);
  let metaY = 102;
  doc.text(`Datum: ${new Date().toLocaleDateString("de-DE")}`, ADDR_X, metaY);
  metaY += 5;
  // Lange Projektnamen umbrechen; Folgezeilen bündig unter dem Wert.
  metaY = drawLabeledWrappedText(
    doc,
    "Projekt: ",
    `${project.name} (${projectKindLabel(project.kind)})`,
    ADDR_X,
    metaY,
    textWidth
  );
  metaY += 5;
  // Ein Zeitraum, der auf einem Tag liegt, wird als einzelnes Datum gerendert
  // statt „24.07.2026 – 24.07.2026" (siehe Angebots-PDF).
  const start = project.planningStart.toLocaleDateString("de-DE");
  const end = project.planningEnd.toLocaleDateString("de-DE");
  doc.text(
    `Lieferzeitraum: ${start === end ? start : `${start} – ${end}`}`,
    ADDR_X,
    metaY
  );

  // ===== Positionstabelle — gleiche Struktur wie die Packliste =====
  const body: RowInput[] = [];

  /** Kategorie-Sektion: Akzentfarbe über die volle Breite. */
  const sectionRow = (label: string): RowInput => [
    {
      content: label,
      colSpan: 3,
      styles: {
        fillColor: ACCENT_RGB,
        textColor: 255,
        fontStyle: "bold" as const,
        fontSize: 10,
        cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      },
    },
  ];

  /** Untergliederung: Packeinheiten / Lose Geräte / Kabel. */
  const subSectionRow = (label: string): RowInput => [
    {
      content: label,
      colSpan: 3,
      styles: {
        fillColor: [235, 235, 235] as [number, number, number],
        textColor: 90,
        fontStyle: "bold" as const,
        fontSize: 8,
        cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 },
      },
    },
  ];

  /** Gesamtgewicht einer Position; ohne gepflegtes Gewicht ein Gedankenstrich. */
  const weightCell = (weightPerUnit: number, quantity: number) => ({
    content: weightPerUnit ? `${(weightPerUnit * quantity).toFixed(1)} kg` : "—",
    styles: { halign: "right" as const },
  });

  for (const g of groups) {
    body.push(sectionRow(g.label));

    if (g.packs.length > 0) body.push(subSectionRow("Packeinheiten"));
    for (const p of g.packs) {
      // Case-Code mit ausweisen, damit der Empfänger die Übergabe Case für
      // Case quittieren kann. Der Packmodus (Fix/Variabel) ist dagegen reine
      // Innenlogik und bleibt dem Kundendokument erspart.
      const loc = p.locationName ? `  ·  ${p.locationName}` : "";
      body.push([
        {
          content: `${p.quantity}×`,
          styles: { fontStyle: "bold" as const, halign: "left" as const },
        },
        {
          content: `${p.code}  ${p.name}${loc}`,
          styles: { fontStyle: "bold" as const },
        },
        weightCell(p.weightPerUnit, p.quantity),
      ]);
      for (const c of p.contents) {
        body.push([
          {
            content: `${c.perUnit}×  (= ${c.total})`,
            styles: {
              textColor: 130,
              fontSize: 8,
              halign: "left" as const,
              // extra Padding links → Inhalts-Anzahl steht eingerückt unter
              // der Anzahl der Packeinheit.
              cellPadding: { top: 1.5, bottom: 1.5, left: 8, right: 3 },
            },
          },
          {
            content: `        ${c.deviceName}`,
            styles: { textColor: 130, fontSize: 8 },
          },
          { content: "", styles: { textColor: 130, fontSize: 8 } },
        ]);
      }
      for (const cab of p.cables) {
        body.push([
          {
            content: `${cab.perUnit}×  (= ${cab.total})`,
            styles: {
              textColor: 130,
              fontSize: 8,
              halign: "left" as const,
              cellPadding: { top: 1.5, bottom: 1.5, left: 8, right: 3 },
            },
          },
          {
            content: `        ${cab.cableName}${cab.spec ? ` · ${cab.spec}` : ""}  (Kabel)`,
            styles: { textColor: 130, fontSize: 8, fontStyle: "italic" as const },
          },
          { content: "", styles: { textColor: 130, fontSize: 8 } },
        ]);
      }
    }

    if (g.loose.length > 0) body.push(subSectionRow("Lose Geräte"));
    for (const l of g.loose) {
      body.push([
        { content: `${l.quantity}×`, styles: { halign: "left" as const } },
        { content: l.deviceName },
        weightCell(l.weightPerUnit, l.quantity),
      ]);
    }

    if (g.cables.length > 0) body.push(subSectionRow("Kabel"));
    for (const c of g.cables) {
      body.push([
        { content: `${c.quantity}×`, styles: { halign: "left" as const } },
        // Länge + Steckerenden dazu, damit klar ist welches Kabel gemeint ist
        { content: c.spec ? `${c.cableName} · ${c.spec}` : c.cableName },
        weightCell(c.weightPerUnit, c.quantity),
      ]);
    }
  }

  autoTable(doc, {
    startY: metaY + 12,
    head: [
      [
        { content: "Anzahl", styles: { halign: "left" as const } },
        { content: "Bezeichnung", styles: { halign: "left" as const } },
        { content: "Gewicht", styles: { halign: "right" as const } },
      ],
    ],
    body,
    theme: "plain",
    styles: {
      font: BODY_FONT,
      fontSize: 9,
      cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 },
    },
    headStyles: {
      font: BODY_FONT,
      fillColor: [60, 60, 60] as [number, number, number],
      textColor: 255,
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 28, halign: "left" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 28, halign: "right" },
    },
    // Oben (Folgeseiten) und unten genug Platz für Briefpapier-Header/Footer
    margin: { top: 35, bottom: PAGE_BOTTOM_RESERVED, left: 14, right: 14 },
  });

  let y =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 8;

  // ===== Summenzeile =====
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.setFont(undefined as unknown as string, "bold");
  doc.text(
    `Summe: ${totals.packs} Packeinheiten | ${totals.devices} Geräte | ${totals.cables} Kabel | ${totals.weightKg.toFixed(1)} kg`,
    14,
    y
  );
  doc.setFont(undefined as unknown as string, "normal");

  // ===== Empfangsbestätigung mit Unterschriftszeilen =====
  // Der Block braucht rund 40 mm — passt er nicht mehr über den Briefpapier-
  // Footer, wandert er komplett auf eine neue Seite.
  const SIGNATURE_BLOCK_HEIGHT = 40;
  y += 14;
  if (y + SIGNATURE_BLOCK_HEIGHT > PAGE_HEIGHT - PAGE_BOTTOM_RESERVED) {
    doc.addPage();
    y = 40;
  }

  doc.setFontSize(9);
  doc.setTextColor(80);
  const noteLines = doc.splitTextToSize(
    "Bitte prüfen Sie die Lieferung bei Übergabe auf Vollständigkeit und Unversehrtheit. Mit der Unterschrift wird der Empfang der oben aufgeführten Positionen bestätigt.",
    textWidth
  ) as string[];
  for (const line of noteLines) {
    doc.text(line, ADDR_X, y);
    y += 4.5;
  }

  y += 18;
  doc.setDrawColor(120);
  doc.setTextColor(80);
  const SIG_LINE_WIDTH = 70;
  const SIG_RIGHT_X = PAGE_WIDTH - TEXT_RIGHT_MARGIN - SIG_LINE_WIDTH;
  doc.line(ADDR_X, y, ADDR_X + SIG_LINE_WIDTH, y);
  doc.text("Ort, Datum", ADDR_X, y + 4);
  doc.line(SIG_RIGHT_X, y, SIG_RIGHT_X + SIG_LINE_WIDTH, y);
  doc.text("Unterschrift Empfänger", SIG_RIGHT_X, y + 4);
  doc.setTextColor(0);

  // ===== Seitenzahl auf jeder Seite ("Seite 1 von 2") =====
  // Erst nach dem Render-Loop stempeln, damit die Gesamtanzahl stimmt.
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

  // Briefpapier darunterlegen (falls hinterlegt)
  const contentBytes = new Uint8Array(doc.output("arraybuffer"));
  const bytes = await applyLetterhead(contentBytes);

  const filename = buildProjectPdfFilename(
    "Lieferschein",
    project.customer?.name ?? null,
    project.name
  );

  return { bytes, filename, project };
}
