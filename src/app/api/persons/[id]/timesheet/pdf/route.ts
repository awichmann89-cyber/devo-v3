import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { setupGeistFont } from "@/lib/pdf-fonts";
import { buildTimesheet } from "@/lib/timesheet";
import { formatCurrency } from "@/lib/utils";
import { employmentTypeLabel } from "@/lib/labels";

/**
 * Stundenzettel-PDF pro Person und Kalendermonat (?month=YYYY-MM) —
 * Arbeitszeitnachweis für die Minijob-Zentrale (MiLoG-Doku).
 * Office-only: auth()-Guard wie alle anderen PDF-Routen.
 */
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const download = url.searchParams.get("download") === "1";
  const month = url.searchParams.get("month") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return new NextResponse("Ungültiger Monat (erwartet YYYY-MM)", { status: 400 });
  }
  const [year, monthNum] = month.split("-").map(Number);

  const { id } = await props.params;
  const person = await prisma.person.findUnique({
    where: { id },
    select: { name: true, employmentType: true },
  });
  if (!person) return new NextResponse("Not found", { status: 404 });

  // workDate ist tagesgenau (UTC-Mitternacht aus "YYYY-MM-DD") — das
  // UTC-Monatsfenster trifft daher exakt.
  const entries = await prisma.timeEntry.findMany({
    where: {
      personId: id,
      workDate: {
        gte: new Date(Date.UTC(year, monthNum - 1, 1)),
        lt: new Date(Date.UTC(year, monthNum, 1)),
      },
    },
    include: { project: { select: { name: true } } },
  });

  const sheet = buildTimesheet({
    month,
    entries: entries.map((e) => ({
      workDate: e.workDate,
      projectName: e.project.name,
      startMinute: e.startMinute,
      endMinute: e.endMinute,
      breakMinutes: e.breakMinutes,
      hourlyWageSnapshot:
        e.hourlyWageSnapshot !== null ? Number(e.hourlyWageSnapshot) : null,
    })),
  });

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  setupGeistFont(doc);
  // autoTable erbt den Doc-Font NICHT — styles.font muss explizit gesetzt
  // werden, sonst fällt die Tabelle auf Helvetica zurück.
  const BODY_FONT = doc.getFont().fontName;

  doc.setFontSize(16);
  doc.setFont(BODY_FONT, "bold");
  doc.text("Stundenzettel", 14, 18);

  doc.setFontSize(10);
  doc.setFont(BODY_FONT, "normal");
  doc.text(`Mitarbeiter/in: ${person.name}`, 14, 27);
  doc.text(
    `Beschäftigungsart: ${employmentTypeLabel(person.employmentType)}`,
    14,
    32
  );
  doc.text(`Monat: ${sheet.monthLabel}`, 14, 37);

  autoTable(doc, {
    startY: 43,
    head: [["Datum", "Projekt", "Beginn", "Ende", "Pause (Min.)", "Dauer (Std.)"]],
    body:
      sheet.rows.length > 0
        ? sheet.rows.map((r) => [
            r.dateLabel,
            r.projectName,
            r.startLabel,
            r.endLabel,
            r.breakLabel,
            r.durationLabel,
          ])
        : [["—", "Keine Einträge in diesem Monat", "", "", "", ""]],
    styles: { font: BODY_FONT, fontSize: 9, cellPadding: 1.5 },
    headStyles: { font: BODY_FONT, fillColor: [60, 60, 60], textColor: 255 },
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
    margin: { top: 20, bottom: 40, left: 14, right: 14 },
  });

  const table = (doc as unknown as { lastAutoTable?: { finalY: number } })
    .lastAutoTable;
  let y = (table?.finalY ?? 43) + 8;

  doc.setFontSize(10);
  doc.setFont(BODY_FONT, "bold");
  doc.text(`Summe: ${sheet.totalLabel} Std.`, 14, y);
  if (sheet.wageTotal !== null && sheet.wageTotal > 0) {
    y += 5;
    doc.text(`Vergütung: ${formatCurrency(sheet.wageTotal)}`, 14, y);
  }

  // Unterschriftszeilen — bei Bedarf auf eine neue Seite ausweichen.
  const pageHeight = doc.internal.pageSize.getHeight();
  let sigY = y + 30;
  if (sigY > pageHeight - 25) {
    doc.addPage();
    sigY = 40;
  }
  doc.setFont(BODY_FONT, "normal");
  doc.setFontSize(9);
  doc.line(14, sigY, 84, sigY);
  doc.text("Ort, Datum, Unterschrift Mitarbeiter/in", 14, sigY + 4);
  doc.line(120, sigY, 190, sigY);
  doc.text("Ort, Datum, Unterschrift Arbeitgeber", 120, sigY + 4);

  const blob = doc.output("arraybuffer");
  const safeName = person.name.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  const filename = `Stundenzettel ${safeName} ${month}.pdf`;
  return new NextResponse(blob, {
    headers: {
      // iOS Safari ignoriert Content-Disposition: attachment bei application/pdf
      // — für Downloads deshalb application/octet-stream (siehe packlist.pdf).
      "Content-Type": download ? "application/octet-stream" : "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
