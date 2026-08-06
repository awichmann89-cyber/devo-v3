import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { setupGeistFont } from "@/lib/pdf-fonts";
import { parseMarkdownBlocks } from "@/lib/markdown-pdf";
import { buildProjectPdfFilename } from "@/lib/utils";

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  // ?download=1 forciert den Download statt der Inline-Anzeige.
  const download = new URL(req.url).searchParams.get("download") === "1";
  const { id } = await props.params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      customer: true,
      projectNotes: { orderBy: { updatedAt: "desc" } },
    },
  });
  if (!project) return new NextResponse("Not found", { status: 404 });

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  // Geist statt Helvetica — sonst zerlegt jsPDF alles außerhalb von WinAnsi
  // (Aufgaben-Haken, Gedankenstriche) und die Zeile läuft auseinander.
  setupGeistFont(doc);
  // autoTable erbt den Doc-Font NICHT — styles.font muss explizit gesetzt werden.
  const FONT = doc.getFont().fontName;

  const PAGE_WIDTH = 210;
  const MARGIN_X = 14;
  const MAX_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
  const PAGE_BOTTOM = 280;
  const INDENT = 5;

  // Header
  doc.setFontSize(20);
  doc.setFont(FONT, "bold");
  doc.text("Notizen", MARGIN_X, 20);
  doc.setFontSize(10);
  doc.setFont(FONT, "normal");
  doc.text(`Projekt: ${project.name}`, MARGIN_X, 28);
  if (project.customer) {
    doc.text(`Kunde: ${project.customer.name}`, MARGIN_X, 33);
  }
  doc.text(
    `Stand: ${new Date().toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })}`,
    MARGIN_X,
    38
  );

  let y = 50;

  /** Sorgt dafür, dass `needed` Millimeter auf der Seite noch frei sind. */
  function ensureSpace(needed: number) {
    if (y + needed <= PAGE_BOTTOM) return;
    doc.addPage();
    y = 20;
  }

  /** Gibt umbrochenen Text aus und schiebt y weiter. */
  function writeLines(text: string, x: number, lineHeight: number) {
    const lines: string[] = doc.splitTextToSize(text, MAX_WIDTH - (x - MARGIN_X));
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, x, y);
      y += lineHeight;
    }
  }

  if (project.projectNotes.length === 0) {
    doc.setTextColor(110);
    doc.text("Keine Notizen vorhanden.", MARGIN_X, y);
  }

  for (const note of project.projectNotes) {
    // Seitenumbruch falls Titel plus erste Zeilen nicht mehr passen
    ensureSpace(40);

    // Trennlinie zwischen Notizen
    if (y > 50) {
      doc.setDrawColor(220);
      doc.line(MARGIN_X, y - 4, PAGE_WIDTH - MARGIN_X, y - 4);
    }

    // Titel
    doc.setFontSize(13);
    doc.setFont(FONT, "bold");
    doc.setTextColor(0);
    doc.text(note.title, MARGIN_X, y);
    y += 5;

    // Aktualisiert-Datum
    // Geist ist nur in Regular und Bold eingebettet — "italic" würde jsPDF auf
    // Times zurückfallen lassen und damit die Umlaute zerlegen.
    doc.setFontSize(8);
    doc.setFont(FONT, "normal");
    doc.setTextColor(110);
    doc.text(
      `Aktualisiert ${note.updatedAt.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })}`,
      MARGIN_X,
      y
    );
    y += 6;

    doc.setTextColor(0);

    const blocks = parseMarkdownBlocks(note.content);
    if (blocks.length === 0) {
      doc.setFontSize(10);
      doc.setFont(FONT, "normal");
      doc.setTextColor(110);
      writeLines("(leer)", MARGIN_X, 5);
      doc.setTextColor(0);
    }

    for (const block of blocks) {
      switch (block.kind) {
        case "heading": {
          const size = block.level === 1 ? 12 : block.level === 2 ? 11 : 10;
          y += 2;
          doc.setFontSize(size);
          doc.setFont(FONT, "bold");
          writeLines(block.text, MARGIN_X, size * 0.5);
          y += 1;
          break;
        }
        case "paragraph": {
          doc.setFontSize(10);
          doc.setFont(FONT, "normal");
          writeLines(block.text, MARGIN_X, 5);
          y += 1;
          break;
        }
        case "listItem": {
          doc.setFontSize(10);
          doc.setFont(FONT, "normal");
          const x = MARGIN_X + block.depth * INDENT;
          ensureSpace(5);
          doc.text(block.marker, x, y);
          writeLines(block.text, x + INDENT, 5);
          break;
        }
        case "task": {
          doc.setFontSize(10);
          doc.setFont(FONT, "normal");
          const x = MARGIN_X + block.depth * INDENT;
          ensureSpace(5);
          doc.text(block.done ? "[x]" : "[ ]", x, y);
          if (block.done) doc.setTextColor(110);
          writeLines(block.text, x + INDENT + 2, 5);
          doc.setTextColor(0);
          break;
        }
        case "quote": {
          doc.setFontSize(10);
          doc.setFont(FONT, "normal");
          doc.setTextColor(110);
          const top = y;
          writeLines(block.text, MARGIN_X + INDENT, 5);
          doc.setDrawColor(190);
          doc.line(MARGIN_X + 1, top - 3.5, MARGIN_X + 1, y - 3.5);
          doc.setTextColor(0);
          break;
        }
        case "code": {
          doc.setFontSize(9);
          doc.setFont(FONT, "normal");
          doc.setTextColor(70);
          writeLines(block.text, MARGIN_X + INDENT, 4.5);
          doc.setTextColor(0);
          y += 1;
          break;
        }
        case "rule": {
          ensureSpace(5);
          doc.setDrawColor(220);
          doc.line(MARGIN_X, y - 1, PAGE_WIDTH - MARGIN_X, y - 1);
          y += 4;
          break;
        }
        case "table": {
          ensureSpace(20);
          autoTable(doc, {
            startY: y,
            head: [block.head],
            body: block.rows,
            styles: { font: FONT, fontSize: 9, cellPadding: 1.5 },
            headStyles: { font: FONT, fillColor: [60, 60, 60], textColor: 255 },
            margin: { top: 20, bottom: 20, left: MARGIN_X, right: MARGIN_X },
          });
          const table = (doc as unknown as { lastAutoTable?: { finalY: number } })
            .lastAutoTable;
          y = (table?.finalY ?? y) + 5;
          break;
        }
      }
    }

    y += 6;
  }

  const blob = doc.output("arraybuffer");
  const filename = buildProjectPdfFilename(
    "Notizen",
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
