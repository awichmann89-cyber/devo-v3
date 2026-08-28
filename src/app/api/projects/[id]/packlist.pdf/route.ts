import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { loadProjectPackList } from "@/lib/packlist-data";
import { buildProjectPdfFilename } from "@/lib/utils";

/**
 * Die jsPDF-Standardfonts (Helvetica & Co.) können nur WinAnsi/Latin-1.
 * Zeichen außerhalb davon — z.B. der Pfeil „→" aus der Kabel-Beschreibung —
 * rendert jsPDF nicht nur falsch, es zerreißt auch die Buchstabenabstände
 * der ganzen Zeile. Deshalb läuft JEDER Text vor der Ausgabe hier durch.
 */
function pdfText(value: string): string {
  return (
    value
      .replace(/[→⇒➔]/g, "->")
      .replace(/[←⇐]/g, "<-")
      .replace(/[✓✔]/g, "x")
      .replace(/[•·]/g, "·") // Bullet → WinAnsi-Mittelpunkt
      // Was WinAnsi dann noch immer nicht kann, ersetzen wir sichtbar,
      // statt es die Zeile zerschießen zu lassen. Erlaubt sind Latin-1
      // plus die WinAnsi-Extras (Anführungszeichen, Gedankenstriche, …, €).
      .replace(/[^\n\x20-\xFF–—‘’‚“”„…€]/g, "?")
  );
}

/** Wendet pdfText auf eine autoTable-Zelle an (String oder {content}). */
type PdfCell = string | { content: string; colSpan?: number; styles?: Record<string, unknown> };
function sanitizeCell(cell: PdfCell): PdfCell {
  if (typeof cell === "string") return pdfText(cell);
  return { ...cell, content: pdfText(cell.content) };
}

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  // ?download=1 forciert den Download statt der Inline-Anzeige.
  const download = new URL(req.url).searchParams.get("download") === "1";
  const { id } = await props.params;

  // Laden + Gruppieren teilt sich die Packliste mit dem Lieferschein,
  // siehe src/lib/packlist-data.ts.
  const data = await loadProjectPackList(id);
  if (!data) return new NextResponse("Not found", { status: 404 });
  const { project, sections, adhoc, totals } = data;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFontSize(20);
  doc.text("Packliste", 14, 20);
  doc.setFontSize(10);
  doc.text(pdfText(`Projekt: ${project.name}`), 14, 28);
  if (project.customer) doc.text(pdfText(`Kunde: ${project.customer.name}`), 14, 33);
  doc.text(
    pdfText(
      `Planung: ${project.planningStart.toLocaleDateString("de-DE")} – ${project.planningEnd.toLocaleDateString("de-DE")}`
    ),
    14,
    38
  );

  type CellDef = PdfCell;
  const body: CellDef[][] = [];

  // Spalten: [0] Abhak-Kästchen · [1] Anzahl · [2] Bezeichnung · [3] Länge ·
  // [4] Gewicht. Die Längen-Spalte gibt es, damit die Kabellängen unabhängig
  // von der Namenslänge untereinander stehen; für Geräte bleibt sie leer.
  const COL_COUNT = 5;
  // Zeilen, die im Lager abgehakt werden — nur echte Positionen, keine
  // Überschriften und keine Case-Inhalte (die reisen mit ihrem Case).
  // Die Kästchen zeichnet der didDrawCell-Hook, siehe unten.
  const checkboxRows = new Set<number>();
  const pushPosition = (row: CellDef[]) => {
    checkboxRows.add(body.length);
    body.push(row);
  };

  // ===== Ordnerstruktur =====
  // Kategorien kommen als Baum (siehe loadProjectPackList().sections). Jede
  // Ebene rückt um INDENT_STEP ein, ihre Positionen um eine Ebene mehr. Ab
  // MAX_INDENT_DEPTH wird nicht weiter eingerückt, sonst frisst eine tiefe
  // Kategorie-Hierarchie die Bezeichnungs-Spalte auf.
  const INDENT_STEP = 4; // mm pro Ebene
  const MAX_INDENT_DEPTH = 4;
  const indent = (depth: number) =>
    3 + Math.min(depth, MAX_INDENT_DEPTH) * INDENT_STEP;
  const pad = (depth: number, top = 1.5, bottom = 1.5) => ({
    top,
    bottom,
    left: indent(depth),
    right: 3,
  });
  // Die Anzahl-Spalte ist nur 28 mm breit — sie macht die Einrückung NICHT
  // mit, sonst bricht „12×  (= 24)" um. Die Staffelung trägt die Bezeichnung.
  // Einzige Ausnahme: Case-Inhalte rücken einen Schritt ein, damit ihre
  // Stückzahlen nicht mit denen der Packeinheiten verwechselt werden.
  const QTY_PAD = { top: 1.5, bottom: 1.5, left: 3, right: 3 };
  const QTY_PAD_CONTENT = { ...QTY_PAD, left: 6 };

  // Kategorie-Sektion: Die Ebene macht sich über Einrückung UND Farbe
  // bemerkbar — je tiefer, desto heller der Streifen.
  const sectionRow = (label: string, depth: number): CellDef[] => {
    const dark: [number, number, number] = [60, 60, 60];
    const mid: [number, number, number] = [120, 120, 120];
    const light: [number, number, number] = [215, 215, 215];
    const fillColor = depth === 0 ? dark : depth === 1 ? mid : light;
    const textColor = depth >= 2 ? 50 : 255;
    const fontSize = depth === 0 ? 10 : depth === 1 ? 9 : 8.5;
    return [
      { content: "", styles: { fillColor, cellPadding: pad(0, 2.5, 2.5) } },
      { content: "", styles: { fillColor, cellPadding: pad(0, 2.5, 2.5) } },
      {
        content: label,
        colSpan: COL_COUNT - 2,
        styles: {
          fillColor,
          textColor,
          fontStyle: "bold",
          fontSize,
          cellPadding: pad(depth, 2.5, 2.5),
        },
      },
    ];
  };

  // Sub-Section („Packeinheiten" / „Lose Geräte"): hellgrau, kleiner
  const subSectionRow = (label: string, depth: number): CellDef[] => [
    {
      content: "",
      styles: {
        fillColor: [235, 235, 235] as [number, number, number],
        cellPadding: pad(0),
      },
    },
    {
      content: "",
      styles: {
        fillColor: [235, 235, 235] as [number, number, number],
        cellPadding: pad(0),
      },
    },
    {
      content: label,
      colSpan: COL_COUNT - 2,
      styles: {
        fillColor: [235, 235, 235] as [number, number, number],
        textColor: 90,
        fontStyle: "bold",
        fontSize: 8,
        cellPadding: pad(depth),
      },
    },
  ];

  /**
   * Beschreibung aus den Stammdaten als Kleingedrucktes unter der Position.
   * Bewusst winzig (6.5 pt) — sie ist Zusatzinfo beim Packen, die Zeile
   * darüber bleibt die Position.
   */
  const descriptionRow = (text: string, depth: number): CellDef[] => [
    { content: "", styles: { cellPadding: pad(0, 0, 1.2) } },
    { content: "", styles: { cellPadding: pad(0, 0, 1.2) } },
    {
      content: text,
      colSpan: COL_COUNT - 2,
      styles: {
        textColor: 140,
        fontSize: 6.5,
        cellPadding: { ...pad(depth, 0, 1.2), right: 20 },
      },
    },
  ];

  /** Gesamtgewicht einer Position; ohne gepflegtes Gewicht ein Gedankenstrich. */
  const weightCell = (weightPerUnit: number, quantity: number): CellDef => ({
    content: weightPerUnit ? `${(weightPerUnit * quantity).toFixed(1)} kg` : "—",
    styles: { halign: "right" },
  });

  /** Kabellänge; rechtsbündig, damit die Zahlen untereinander stehen. */
  const lengthCell = (lengthLabel: string | null, small = false): CellDef => ({
    content: lengthLabel ?? "",
    styles: small
      ? { halign: "right", textColor: 130, fontSize: 8 }
      : { halign: "right" },
  });

  /** Platzhalter der Abhak-Spalte — das Kästchen selbst zeichnet didDrawCell. */
  const checkCell: CellDef = { content: "" };

  /** Eine Position der Liste (Packeinheit / loses Gerät / Kabel). */
  const positionRow = (
    quantity: string,
    label: string,
    length: CellDef,
    weight: CellDef,
    depth: number,
    bold = false
  ): CellDef[] => [
    checkCell,
    {
      content: quantity,
      styles: {
        halign: "left",
        ...(bold ? { fontStyle: "bold" } : {}),
        cellPadding: QTY_PAD,
      },
    },
    {
      content: label,
      styles: {
        ...(bold ? { fontStyle: "bold" } : {}),
        cellPadding: pad(depth),
      },
    },
    length,
    weight,
  ];

  /** Inhalt einer Packeinheit — kleiner, grau, eine Ebene tiefer. */
  const contentRow = (
    quantity: string,
    label: string,
    depth: number,
    italic = false,
    length: CellDef = { content: "" }
  ): CellDef[] => [
    checkCell,
    {
      content: quantity,
      styles: {
        textColor: 130,
        fontSize: 8,
        halign: "left",
        cellPadding: QTY_PAD_CONTENT,
      },
    },
    {
      content: label,
      styles: {
        textColor: 130,
        fontSize: 8,
        ...(italic ? { fontStyle: "italic" } : {}),
        cellPadding: pad(depth),
      },
    },
    length,
    { content: "", styles: { textColor: 130, fontSize: 8 } },
  ];

  for (const sec of sections) {
    body.push(sectionRow(sec.name, sec.depth));
    // Positionen hängen eine Ebene unter ihrer Kategorie, Case-Inhalte noch
    // eine darunter. Leere Zwischenebenen liefern nur ihren Header.
    const itemDepth = sec.depth + 1;
    const contentDepth = sec.depth + 2;

    if (sec.packs.length > 0) body.push(subSectionRow("Packeinheiten", itemDepth));
    for (const p of sec.packs) {
      const mode = p.mode === "FIXED" ? "Fix" : "Variabel";
      const loc = p.locationName ? ` · ${p.locationName}` : "";
      pushPosition(
        positionRow(
          `${p.quantity}×`,
          `${p.name}  (${mode}${loc})`,
          lengthCell(null),
          weightCell(p.weightPerUnit, p.quantity),
          itemDepth,
          true
        )
      );
      if (p.description) body.push(descriptionRow(p.description, itemDepth));
      for (const c of p.contents) {
        body.push(
          contentRow(`${c.perUnit}×  (= ${c.total})`, c.deviceName, contentDepth)
        );
      }
      for (const cab of p.cables) {
        // Wie bei den gebuchten Kabeln: Steckerenden stehen darunter.
        const len = cab.specParts.lengthLabel;
        body.push(
          contentRow(
            `${cab.perUnit}×  (= ${cab.total})`,
            `${cab.cableName}  (Kabel)`,
            contentDepth,
            true,
            lengthCell(len, true)
          )
        );
        if (cab.specParts.connectors) {
          body.push(descriptionRow(cab.specParts.connectors, contentDepth));
        }
      }
    }

    if (sec.loose.length > 0) body.push(subSectionRow("Lose Geräte", itemDepth));
    for (const l of sec.loose) {
      pushPosition(
        positionRow(
          `${l.quantity}×`,
          l.deviceName,
          lengthCell(null),
          weightCell(l.weightPerUnit, l.quantity),
          itemDepth
        )
      );
      if (l.description) body.push(descriptionRow(l.description, itemDepth));
    }

    if (sec.cables.length > 0) body.push(subSectionRow("Kabel", itemDepth));
    for (const c of sec.cables) {
      // In der Positionszeile steht nur der Name — die Länge bekommt eine
      // eigene Spalte, damit sie unabhängig vom Namen untereinander steht.
      // Die Steckerenden sind zwar zum Identifizieren nötig, machen die Zeile
      // aber doppelt so lang — sie stehen deshalb als Kleingedrucktes darunter,
      // zusammen mit einer gepflegten Beschreibung.
      pushPosition(
        positionRow(
          `${c.quantity}×`,
          c.cableName,
          lengthCell(c.specParts.lengthLabel),
          weightCell(c.weightPerUnit, c.quantity),
          itemDepth
        )
      );
      if (c.specParts.connectors) {
        body.push(descriptionRow(c.specParts.connectors, itemDepth));
      }
      if (c.description) body.push(descriptionRow(c.description, itemDepth));
    }
  }

  // Vorübergehende Geräte hängen an keiner Kategorie — sie bekommen deshalb
  // eine eigene Sektion am Ende, statt unter „Ohne Kategorie" zu verschwinden.
  if (adhoc.length > 0) {
    body.push(sectionRow("Vorübergehende Geräte", 0));
    for (const a of adhoc) {
      pushPosition(
        // Für Ad-hoc-Positionen führt das Datenmodell kein Gewicht.
        positionRow(
          `${a.quantity}×`,
          a.name,
          lengthCell(null),
          weightCell(0, a.quantity),
          1
        )
      );
      if (a.description) body.push(descriptionRow(a.description, 1));
    }
  }

  autoTable(doc, {
    startY: 48,
    head: [["", "Anzahl", "Bezeichnung", "Länge", "Gewicht"]],
    // Sonderzeichen erst hier abfangen — so muss keine der Zeilen-Bauten
    // oben daran denken.
    body: body.map((row) => row.map(sanitizeCell)),
    theme: "plain",
    styles: { fontSize: 10, cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 } },
    headStyles: {
      fillColor: [40, 40, 40] as [number, number, number],
      textColor: 255,
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 9 },
      1: { cellWidth: 28, halign: "left" },
      2: { cellWidth: "auto" },
      3: { cellWidth: 20, halign: "right" },
      4: { cellWidth: 26, halign: "right" },
    },
    // Abhak-Kästchen zum Ankreuzen im Lager. Als gezeichnetes Quadrat statt
    // als Zeichen — die WinAnsi-Fonts von jsPDF haben kein Kästchen-Glyph
    // (siehe pdfText()), und gezeichnet sitzt es sauber mittig in der Zeile.
    didDrawCell: (data) => {
      if (data.section !== "body" || data.column.index !== 0) return;
      if (!checkboxRows.has(data.row.index)) return;
      const size = 3.4;
      doc.setDrawColor(90);
      doc.setLineWidth(0.3);
      doc.rect(
        data.cell.x + (data.cell.width - size) / 2,
        data.cell.y + (data.cell.height - size) / 2,
        size,
        size
      );
    },
  });

  // @ts-expect-error: lastAutoTable
  const finalY: number = doc.lastAutoTable.finalY;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(
    pdfText(
      `Summe: ${totals.packs} Packeinheiten | ${totals.devices} Geräte | ${totals.cables} Kabel | ${totals.weightKg.toFixed(1)} kg`
    ),
    14,
    finalY + 8
  );

  const blob = doc.output("arraybuffer");
  const filename = buildProjectPdfFilename(
    "Packliste",
    project.customer?.name ?? null,
    project.name
  );
  return new NextResponse(blob, {
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
