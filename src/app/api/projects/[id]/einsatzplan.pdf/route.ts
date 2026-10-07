import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { prisma } from "@/lib/prisma";
import { buildProjectPdfFilename, formatDate } from "@/lib/utils";
import { pdfText, sanitizeCell, type PdfCell } from "@/lib/pdf-text";
import { berlinTime, rangeHasClockTime } from "@/lib/personnel-schedule";
import {
  conflictsByBooking,
  loadPersonBookings,
  loadVehicleBookings,
} from "@/lib/booking-load";
import { maxSeverity, type ConflictHit } from "@/lib/booking-conflicts";
import {
  conflictSeverityLabel,
  employmentTypeLabel,
  vehicleKindLabel,
} from "@/lib/labels";

/**
 * Zeitfenster eines Einsatzes als Text — gleiche Fallback-Kette wie im
 * Projekt-Tab: Uhrzeiten → gewählter Berechnungszeitraum → Planungszeitraum.
 * Der Server läuft in UTC, deshalb alles explizit in Berlin-Wanduhrzeit.
 */
function timeLabel(
  a: {
    plannedStart: Date | null;
    plannedEnd: Date | null;
    billingPeriod: { start: Date; end: Date; notes: string | null } | null;
  },
  fallback: string
): string {
  if (a.plannedStart && a.plannedEnd) {
    const s = a.plannedStart;
    const e = a.plannedEnd;
    if (formatDate(s) === formatDate(e)) {
      return `${berlinTime(s)}–${berlinTime(e)} Uhr`;
    }
    return `${formatDate(s)} ${berlinTime(s)} – ${formatDate(e)} ${berlinTime(e)}`;
  }
  const p = a.billingPeriod;
  if (!p) return fallback;
  const withTimes = rangeHasClockTime(p.start, p.end);
  let range: string;
  if (formatDate(p.start) === formatDate(p.end)) {
    range = withTimes
      ? `${berlinTime(p.start)}–${berlinTime(p.end)} Uhr`
      : "ganztägig";
  } else {
    range = withTimes
      ? `${formatDate(p.start)} ${berlinTime(p.start)} – ${formatDate(p.end)} ${berlinTime(p.end)}`
      : `${formatDate(p.start)} – ${formatDate(p.end)}`;
  }
  return p.notes ? `${range} (${p.notes})` : range;
}

/** Konflikt-Hinweis: „Überbucht: Projekt A, Projekt B". */
function conflictText(conflicts: ConflictHit[]): string | null {
  const severity = maxSeverity(conflicts);
  if (!severity) return null;
  return `${conflictSeverityLabel(severity)}: ${conflicts
    .map((c) => c.projectName)
    .join(", ")}`;
}

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  // ?download=1 forciert den Download statt der Inline-Anzeige.
  const download = new URL(req.url).searchParams.get("download") === "1";
  const { id } = await props.params;

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      name: true,
      planningStart: true,
      planningEnd: true,
      customer: { select: { name: true } },
      groups: { where: { kind: "SERVICE" }, select: { id: true, name: true } },
      services: {
        orderBy: { sortOrder: "asc" },
        select: {
          groupId: true,
          serviceItem: { select: { name: true, kind: true } },
          personAssignments: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              personId: true,
              plannedStart: true,
              plannedEnd: true,
              notes: true,
              person: { select: { name: true, employmentType: true } },
              billingPeriod: { select: { start: true, end: true, notes: true } },
            },
          },
          vehicleAssignments: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              vehicleId: true,
              plannedStart: true,
              plannedEnd: true,
              notes: true,
              vehicle: { select: { name: true, kind: true, licensePlate: true } },
              driver: { select: { name: true } },
              billingPeriod: { select: { start: true, end: true, notes: true } },
            },
          },
        },
      },
    },
  });
  if (!project) return new NextResponse("Not found", { status: 404 });

  // Überbuchungen wie im Projekt-Tab: alle Einsätze der beteiligten
  // Personen/Einheiten laden — auch aus anderen Projekten.
  const personIds = [
    ...new Set(project.services.flatMap((s) => s.personAssignments.map((a) => a.personId))),
  ];
  const vehicleIds = [
    ...new Set(project.services.flatMap((s) => s.vehicleAssignments.map((a) => a.vehicleId))),
  ];
  const [personBookings, vehicleBookings] = await Promise.all([
    loadPersonBookings(personIds),
    loadVehicleBookings(vehicleIds),
  ]);
  const personConflicts = conflictsByBooking(personBookings);
  const vehicleConflicts = conflictsByBooking(vehicleBookings);

  // Alle Personal- UND Fuhrpark-Einsätze chronologisch (nach effektivem
  // Beginn) — eine Liste, damit Personal und Fahrzeuge eines Tages
  // zusammenstehen.
  type Entry = {
    start: Date;
    time: string;
    who: string;
    kind: string;
    position: string;
    group: string;
    hints: string[];
  };
  const groupName = new Map(project.groups.map((g) => [g.id, g.name]));
  const planning = `${formatDate(project.planningStart)} – ${formatDate(project.planningEnd)}`;
  const entries: Entry[] = [];
  for (const s of project.services) {
    const group = groupName.get(s.groupId) ?? "";
    for (const a of s.personAssignments) {
      const conflict = conflictText(personConflicts[a.id] ?? []);
      entries.push({
        start: a.plannedStart ?? a.billingPeriod?.start ?? project.planningStart,
        time: timeLabel(a, `ganztägig (${planning})`),
        who: a.person.name,
        kind: employmentTypeLabel(a.person.employmentType),
        position: s.serviceItem.name,
        group,
        hints: [conflict, a.notes].filter((h): h is string => !!h),
      });
    }
    for (const a of s.vehicleAssignments) {
      const conflict = conflictText(vehicleConflicts[a.id] ?? []);
      const plate = a.vehicle.licensePlate ? ` (${a.vehicle.licensePlate})` : "";
      entries.push({
        start: a.plannedStart ?? a.billingPeriod?.start ?? project.planningStart,
        time: timeLabel(a, `geblockt (${planning})`),
        who: `${a.vehicle.name}${plate}`,
        kind: vehicleKindLabel(a.vehicle.kind),
        position: s.serviceItem.name,
        group,
        hints: [
          a.driver ? `Fahrer: ${a.driver.name}` : null,
          conflict,
          a.notes,
        ].filter((h): h is string => !!h),
      });
    }
  }
  entries.sort((x, y) => +x.start - +y.start);

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  doc.setFontSize(20);
  doc.text("Einsatzplan", 14, 20);
  doc.setFontSize(10);
  doc.text(pdfText(`Projekt: ${project.name}`), 14, 28);
  if (project.customer) doc.text(pdfText(`Kunde: ${project.customer.name}`), 14, 33);
  doc.text(pdfText(`Planung: ${planning}`), 14, 38);

  // Ein grauer Streifen je Kalendertag (Berlin), darunter die Einsätze des
  // Tages — die Zeit-Spalte trägt dann nur noch die Uhrzeit.
  const COL_COUNT = 6;
  const body: PdfCell[][] = [];
  let currentDay = "";
  for (const e of entries) {
    const day = formatDate(e.start);
    if (day !== currentDay) {
      currentDay = day;
      const weekday = e.start.toLocaleDateString("de-DE", {
        weekday: "long",
        timeZone: "Europe/Berlin",
      });
      body.push([
        {
          content: `${weekday}, ${day}`,
          colSpan: COL_COUNT,
          styles: {
            fillColor: [60, 60, 60] as [number, number, number],
            textColor: 255,
            fontStyle: "bold",
          },
        },
      ]);
    }
    body.push([
      e.time,
      { content: e.who, styles: { fontStyle: "bold" } },
      e.kind,
      e.position,
      e.group,
      e.hints.join("\n"),
    ]);
  }

  // Positionen ohne Besetzung fallen sonst nicht auf — sie stehen als
  // Warnung unter der Tabelle.
  const unstaffed = project.services
    .filter(
      (s) =>
        (s.serviceItem.kind === "PERSONAL" && s.personAssignments.length === 0) ||
        (s.serviceItem.kind === "TRANSPORT" && s.vehicleAssignments.length === 0)
    )
    .map((s) => s.serviceItem.name);

  if (body.length === 0) {
    doc.setTextColor(120);
    doc.text("Noch keine Einsätze geplant.", 14, 50);
    doc.setTextColor(0);
  } else {
    autoTable(doc, {
      startY: 46,
      head: [["Zeit", "Person / Einheit", "Art", "Position", "Gruppe", "Hinweise"]],
      body: body.map((row) => row.map(sanitizeCell)),
      theme: "plain",
      styles: { fontSize: 9, cellPadding: { top: 1.2, bottom: 1.2, left: 3, right: 3 } },
      headStyles: {
        fillColor: [40, 40, 40] as [number, number, number],
        textColor: 255,
        fontStyle: "bold",
      },
      columnStyles: {
        0: { cellWidth: 42 },
        1: { cellWidth: 50 },
        2: { cellWidth: 26 },
        3: { cellWidth: 48 },
        4: { cellWidth: 36 },
        5: { cellWidth: "auto" },
      },
      // Dünne Trennlinie unter jeder Einsatz-Zeile.
      didDrawCell: (data) => {
        if (data.section !== "body" || data.column.index !== 0) return;
        const raw = data.row.raw as PdfCell[];
        if (raw.length === 1) return; // Tages-Streifen
        doc.setDrawColor(220);
        doc.setLineWidth(0.2);
        const y = data.cell.y + data.cell.height;
        const { left, right } = data.table.settings.margin;
        doc.line(left, y, doc.internal.pageSize.getWidth() - right, y);
      },
    });
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Endet die Tabelle knapp über dem Seitenfuß, lieber eine Seite weiter.
  // @ts-expect-error: lastAutoTable
  const finalY: number = body.length > 0 ? doc.lastAutoTable.finalY : 50;
  let summaryY = finalY + 8;
  if (summaryY > pageHeight - 24) {
    doc.addPage();
    summaryY = 20;
  }
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  const personCount = project.services.reduce((n, s) => n + s.personAssignments.length, 0);
  const vehicleCount = project.services.reduce((n, s) => n + s.vehicleAssignments.length, 0);
  doc.text(
    pdfText(`Summe: ${personCount} Personal-Einsätze | ${vehicleCount} Fuhrpark-Einsätze`),
    14,
    summaryY
  );
  if (unstaffed.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 90, 0);
    const lines = doc.splitTextToSize(
      pdfText(`Unbesetzt: ${unstaffed.join(", ")}`),
      pageWidth - 28
    );
    doc.text(lines, 14, summaryY + 6);
    doc.setTextColor(0);
  }

  // Seitenzahlen zum Schluss: erst jetzt steht die Gesamtzahl fest.
  const pageCount = doc.getNumberOfPages();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120);
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.text(`Seite ${page} von ${pageCount}`, pageWidth - 14, pageHeight - 8, {
      align: "right",
    });
  }
  doc.setTextColor(0);

  const blob = doc.output("arraybuffer");
  const filename = buildProjectPdfFilename(
    "Einsatzplan",
    project.customer?.name ?? null,
    project.name
  );
  return new NextResponse(blob, {
    headers: {
      // iOS Safari: siehe Packliste — für Downloads application/octet-stream.
      "Content-Type": download ? "application/octet-stream" : "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
