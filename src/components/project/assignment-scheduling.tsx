"use client";

import { AlertTriangle } from "lucide-react";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { conflictSeverity, type ConflictSeverity } from "@/lib/booking-conflicts";
import { conflictSeverityLabel } from "@/lib/labels";

/**
 * Gemeinsame Bausteine der Einplanungs-Dialoge (Personal und Fuhrpark):
 * Zeit-Umrechnung für die Formularfelder, Zeitraum-Labels und die
 * Überbuchungs-Warnung. Beide Dialoge planen dieselbe Art Ressource an
 * dieselbe Art Preiszeile — die Logik gehört genau einmal hierher.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Berechnungszeitraum des Projekts (ISO-Strings). */
export interface PeriodOptionVM {
  id: string;
  start: string;
  end: string;
  notes: string | null;
}

/** Fremd-Belegung einer Ressource (anderes Projekt) für die Warnung. */
export interface BusyIntervalVM {
  projectName: string;
  start: string; // ISO, halboffenes Intervall [start, end)
  end: string;
  timed: boolean;
}

/** Bewertete Fremd-Belegung — Grundlage der zweistufigen Warnung. */
export interface BusyConflictVM extends BusyIntervalVM {
  severity: ConflictSeverity;
}

/** Trägt der ISO-Zeitpunkt eine echte Uhrzeit (lokale Wanduhr ≠ 00:00)? */
export function hasClockTimeIso(iso: string): boolean {
  const d = new Date(iso);
  return d.getHours() !== 0 || d.getMinutes() !== 0;
}

/**
 * Anzeige-Label eines Berechnungszeitraums — inkl. Uhrzeiten, wenn der
 * Zeitraum welche trägt: "08.08.2026, 10:00–23:00 Uhr (Veranstaltungstag 1)".
 */
export function periodLabel(p: {
  start: string;
  end: string;
  notes: string | null;
}): string {
  const withTimes = hasClockTimeIso(p.start) || hasClockTimeIso(p.end);
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  let range: string;
  if (formatDate(p.start) === formatDate(p.end)) {
    range = withTimes
      ? `${formatDate(p.start)}, ${time(p.start)}–${time(p.end)} Uhr`
      : formatDate(p.start);
  } else {
    range = withTimes
      ? `${formatDate(p.start)} ${time(p.start)} – ${formatDate(p.end)} ${time(p.end)}`
      : `${formatDate(p.start)} – ${formatDate(p.end)}`;
  }
  return p.notes ? `${range} (${p.notes})` : range;
}

/** ISO-Instant → Wert für <input type="datetime-local"> (Browser-Lokalzeit). */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/** datetime-local-Wert (Browser-Lokalzeit) → ISO-Instant für den Server. */
export function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}

/** Datum aus ISO + feste Uhrzeit → datetime-local-Vorbelegung. */
export function dateWithTime(iso: string, time: string): string {
  return `${isoToLocalInput(iso).slice(0, 10)}T${time}`;
}

/**
 * Effektives Zeitfenster der Formulareingabe — dieselbe Fallback-Kette wie
 * `assignmentEffectiveRange` auf dem Server: eigene Uhrzeiten → gewählter
 * Zeitraum (mit dessen Uhrzeiten) → ganztägig bis Ende des letzten Tages.
 */
export function candidateRange({
  withTimes,
  start,
  end,
  period,
  planningStartIso,
  planningEndIso,
}: {
  withTimes: boolean;
  start: string;
  end: string;
  period: { start: string; end: string } | null;
  planningStartIso: string;
  planningEndIso: string;
}): { start: Date; end: Date } | null {
  if (withTimes) {
    if (!start || !end) return null;
    return { start: new Date(start), end: new Date(end) };
  }
  const base = period ?? { start: planningStartIso, end: planningEndIso };
  if (hasClockTimeIso(base.start) || hasClockTimeIso(base.end)) {
    return { start: new Date(base.start), end: new Date(base.end) };
  }
  return {
    start: new Date(base.start),
    end: new Date(new Date(base.end).getTime() + DAY_MS),
  };
}

/**
 * Bewertet das Kandidaten-Zeitfenster gegen die Fremd-Belegungen der Ressource.
 * Zweistufig: echte Überschneidung vs. gleicher Kalendertag.
 */
export function evaluateBusy(
  candidate: { start: Date; end: Date } | null,
  busy: BusyIntervalVM[]
): BusyConflictVM[] {
  if (!candidate) return [];
  const out: BusyConflictVM[] = [];
  for (const b of busy) {
    const severity = conflictSeverity(candidate, {
      start: new Date(b.start),
      end: new Date(b.end),
    });
    if (severity) out.push({ ...b, severity });
  }
  return out.sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "OVERLAP" ? -1 : 1
  );
}

/** Zeitfenster einer Fremd-Belegung als Text (ganztägig ⇒ letzter Tag −1 Tag). */
export function busyIntervalLabel(b: BusyIntervalVM): string {
  return b.timed
    ? `${formatDateTime(b.start)} – ${formatDateTime(b.end)}`
    : `${formatDate(b.start)} – ${formatDate(
        new Date(new Date(b.end).getTime() - DAY_MS)
      )} (ganztägig)`;
}

/**
 * Warn-Box im Einplanungs-Dialog. Rot, sobald sich ein Zeitfenster echt
 * überschneidet; sonst gelb für „nur am selben Tag". Einplanen bleibt in
 * beiden Fällen möglich — die Entscheidung trifft die Disposition.
 */
export function ConflictWarning({
  conflicts,
  resource,
}: {
  conflicts: BusyConflictVM[];
  /** Wie die Ressource im Text heißt: "Person", "Einheit". */
  resource: string;
}) {
  if (conflicts.length === 0) return null;
  const hasOverlap = conflicts.some((c) => c.severity === "OVERLAP");

  return (
    <div
      className={cn(
        "space-y-1 rounded-md border p-3 text-sm",
        hasOverlap
          ? "border-destructive/40 bg-destructive-subtle/50"
          : "border-warning/40 bg-warning-subtle/50"
      )}
    >
      <p
        className={cn(
          "flex items-center gap-2 font-medium",
          hasOverlap ? "text-destructive" : "text-warning"
        )}
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {hasOverlap
          ? "Überbuchung: zeitgleich eingeplant in"
          : "Am selben Tag eingeplant in"}
      </p>
      <ul className="ml-6 list-disc text-xs">
        {conflicts.map((c, i) => (
          <li
            key={i}
            className={
              c.severity === "OVERLAP" ? "text-destructive" : "text-warning"
            }
          >
            {c.projectName} — {busyIntervalLabel(c)}
            {hasOverlap && ` · ${conflictSeverityLabel(c.severity)}`}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {hasOverlap
          ? `Einplanen ist trotzdem möglich — bitte Zeiten prüfen (${resource} kann nicht an zwei Orten sein).`
          : `Kein Zeitkonflikt, aber knapp: ${resource} ist am selben Tag anderweitig unterwegs.`}
      </p>
    </div>
  );
}
