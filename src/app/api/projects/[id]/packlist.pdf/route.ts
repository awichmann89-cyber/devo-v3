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
  const { project, groups, adhoc, totals } = data;

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

  // Kategorie-Section: dunkler Streifen, Text in Bezeichnungs-Spalte
  const sectionRow = (label: string): CellDef[] => [
    {
      content: "",
      styles: {
        fillColor: [60, 60, 60] as [number, number, number],
        cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      },
    },
    {
      content: label,
      colSpan: 2,
      styles: {
        fillColor: [60, 60, 60] as [number, number, number],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 10,
        cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      },
    },
  ];

  // Sub-Section („Packeinheiten" / „Lose Geräte"): hellgrau, kleiner
  const subSectionRow = (label: string): CellDef[] => [
    {
      content: "",
      styles: {
        fillColor: [235, 235, 235] as [number, number, number],
        cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 },
      },
    },
    {
      content: label,
      colSpan: 2,
      styles: {
        fillColor: [235, 235, 235] as [number, number, number],
        textColor: 90,
        fontStyle: "bold",
        fontSize: 8,
        cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 },
      },
    },
  ];

  for (const g of groups) {
    body.push(sectionRow(g.label));

    if (g.packs.length > 0) body.push(subSectionRow("Packeinheiten"));
    for (const p of g.packs) {
      const mode = p.mode === "FIXED" ? "Fix" : "Variabel";
      const loc = p.locationName ? ` · ${p.locationName}` : "";
      body.push([
        {
          content: `${p.quantity}×`,
          styles: { fontStyle: "bold", halign: "left" },
        },
        {
          content: `${p.name}  (${mode}${loc})`,
          styles: { fontStyle: "bold" },
        },
        {
          content: p.weightPerUnit
            ? `${(p.weightPerUnit * p.quantity).toFixed(1)} kg`
            : "—",
          styles: { halign: "right" },
        },
      ]);
      for (const c of p.contents) {
        body.push([
          {
            content: `${c.perUnit}×  (= ${c.total})`,
            styles: {
              textColor: 130,
              fontSize: 8,
              halign: "left",
              // extra Padding links → Inhalts-Anzahl rutscht vom linken Rand
              // nach innen und steht damit eingerückt unter der Pack-Anzahl.
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
              halign: "left",
              cellPadding: { top: 1.5, bottom: 1.5, left: 8, right: 3 },
            },
          },
          {
            content: `        ${cab.cableName}${cab.spec ? ` · ${cab.spec}` : ""}  (Kabel)`,
            styles: { textColor: 130, fontSize: 8, fontStyle: "italic" },
          },
          { content: "", styles: { textColor: 130, fontSize: 8 } },
        ]);
      }
    }

    if (g.loose.length > 0) body.push(subSectionRow("Lose Geräte"));
    for (const l of g.loose) {
      body.push([
        { content: `${l.quantity}×`, styles: { halign: "left" } },
        l.deviceName,
        {
          content: l.weightPerUnit
            ? `${(l.weightPerUnit * l.quantity).toFixed(1)} kg`
            : "—",
          styles: { halign: "right" },
        },
      ]);
    }

    if (g.cables.length > 0) body.push(subSectionRow("Kabel"));
    for (const c of g.cables) {
      body.push([
        { content: `${c.quantity}×`, styles: { halign: "left" } },
        // Länge + Steckerenden dazu, damit beim Packen klar ist welches Kabel
        c.spec ? `${c.cableName} · ${c.spec}` : c.cableName,
        {
          content: c.weightPerUnit
            ? `${(c.weightPerUnit * c.quantity).toFixed(1)} kg`
            : "—",
          styles: { halign: "right" },
        },
      ]);
    }
  }

  // Vorübergehende Geräte hängen an keiner Kategorie — sie bekommen deshalb
  // eine eigene Sektion am Ende, statt unter „Ohne Kategorie" zu verschwinden.
  if (adhoc.length > 0) {
    body.push(sectionRow("Vorübergehende Geräte"));
    for (const a of adhoc) {
      body.push([
        { content: `${a.quantity}×`, styles: { halign: "left" } },
        a.name,
        // Für Ad-hoc-Positionen führt das Datenmodell kein Gewicht.
        { content: "—", styles: { halign: "right" } },
      ]);
      if (a.description) {
        body.push([
          {
            content: "",
            styles: {
              textColor: 130,
              fontSize: 8,
              cellPadding: { top: 1.5, bottom: 1.5, left: 8, right: 3 },
            },
          },
          { content: a.description, styles: { textColor: 130, fontSize: 8 } },
          { content: "", styles: { textColor: 130, fontSize: 8 } },
        ]);
      }
    }
  }

  autoTable(doc, {
    startY: 48,
    head: [["Anzahl", "Bezeichnung", "Gewicht"]],
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
      0: { cellWidth: 28, halign: "left" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 28, halign: "right" },
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
