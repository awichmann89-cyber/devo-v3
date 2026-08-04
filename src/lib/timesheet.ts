// Stundenzettel (Arbeitszeitnachweis) pro Person und Kalendermonat.
// Pure Domain-Builder (kein Prisma, kein jsPDF) — Muster buildPackList.
// Format orientiert sich an der MiLoG-Dokumentationspflicht: Datum, Beginn,
// Ende, Pause, Dauer pro Arbeitstag + Monatssumme.

import {
  formatMinutes,
  minutesToClock,
  timeEntryCost,
  workedMinutes,
} from "@/lib/personnel-costs";

export interface TimesheetEntryInput {
  workDate: Date;
  projectName: string;
  startMinute: number;
  endMinute: number;
  breakMinutes: number;
  hourlyWageSnapshot: number | null;
}

export interface TimesheetRow {
  dateLabel: string;
  projectName: string;
  startLabel: string;
  endLabel: string;
  breakLabel: string;
  durationLabel: string;
  durationMinutes: number;
}

export interface Timesheet {
  monthLabel: string;
  rows: TimesheetRow[];
  totalMinutes: number;
  totalLabel: string;
  /** Summe Minuten × Lohn-Snapshot — null, wenn kein Eintrag einen Lohn trägt. */
  wageTotal: number | null;
}

/** "YYYY-MM" → "August 2026". */
export function timesheetMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function buildTimesheet(opts: {
  month: string; // "YYYY-MM"
  entries: TimesheetEntryInput[];
}): Timesheet {
  const sorted = [...opts.entries].sort(
    (a, b) => +a.workDate - +b.workDate || a.startMinute - b.startMinute
  );

  const rows: TimesheetRow[] = sorted.map((e) => {
    const minutes = workedMinutes(e);
    return {
      // workDate ist tagesgenau (UTC-Mitternacht) — UTC formatieren,
      // damit kein TZ-Shift das Datum verschiebt.
      dateLabel: e.workDate.toLocaleDateString("de-DE", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      }),
      projectName: e.projectName,
      startLabel: minutesToClock(e.startMinute),
      endLabel: minutesToClock(e.endMinute),
      breakLabel: e.breakMinutes > 0 ? String(e.breakMinutes) : "—",
      durationLabel: formatMinutes(minutes),
      durationMinutes: minutes,
    };
  });

  const totalMinutes = rows.reduce((s, r) => s + r.durationMinutes, 0);
  const hasWage = sorted.some((e) => e.hourlyWageSnapshot != null);
  const wageTotal = hasWage
    ? sorted.reduce((s, e) => s + timeEntryCost(e), 0)
    : null;

  return {
    monthLabel: timesheetMonthLabel(opts.month),
    rows,
    totalMinutes,
    totalLabel: formatMinutes(totalMinutes),
    wageTotal,
  };
}
