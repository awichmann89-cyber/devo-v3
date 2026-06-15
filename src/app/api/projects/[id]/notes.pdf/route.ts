import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { jsPDF } from "jspdf";
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
  const PAGE_WIDTH = 210;
  const MARGIN_X = 14;
  const MAX_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
  const PAGE_BOTTOM = 280;

  // Header
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("Notizen", MARGIN_X, 20);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
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

  if (project.projectNotes.length === 0) {
    doc.setTextColor(110);
    doc.text("Keine Notizen vorhanden.", MARGIN_X, y);
  }

  for (const note of project.projectNotes) {
    // Seitenumbruch falls Titel nicht mehr passt
    if (y > PAGE_BOTTOM - 40) {
      doc.addPage();
      y = 20;
    }

    // Trennlinie zwischen Notizen
    if (y > 50) {
      doc.setDrawColor(220);
      doc.line(MARGIN_X, y - 4, PAGE_WIDTH - MARGIN_X, y - 4);
    }

    // Titel
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text(note.title, MARGIN_X, y);
    y += 5;

    // Aktualisiert-Datum
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
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
    y += 5;

    // Inhalt (Markdown wird flach als Text ausgegeben — bewusst simpel)
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);
    const lines = doc.splitTextToSize(note.content || "(leer)", MAX_WIDTH);
    for (const line of lines) {
      if (y > PAGE_BOTTOM) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, MARGIN_X, y);
      y += 5;
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
