// Bewertung von Buchungskonflikten — EINE Quelle für Personal- UND
// Fahrzeug-/Anhänger-Einsätze (Projektseite, Einplanungs-Dialoge,
// Stammdaten-Detailseiten).
//
// Zweistufig, weil die beiden Fälle disponierbar unterschiedlich sind:
//   OVERLAP  → die Zeitfenster überschneiden sich echt. Physisch unmöglich,
//              rot.
//   SAME_DAY → gleicher Kalendertag (Europe/Berlin), aber ohne Überschneidung.
//              Fachlich möglich (Vormittag Projekt A, Abend Projekt B), aber
//              eng — gelbe Warnung, damit der Disponent hinsieht.
//
// Zeitfenster kommen als halboffene Intervalle [start, end) aus
// `assignmentEffectiveRange` (siehe personnel-schedule.ts) — ganztägige
// Einsätze laufen dort bis zum Ende des letzten Tages.

import { rangesOverlap } from "@/lib/personnel-schedule";

const APP_TZ = "Europe/Berlin";

export type ConflictSeverity = "OVERLAP" | "SAME_DAY";

export interface ConflictRange {
  start: Date;
  end: Date;
}

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Kalendertag eines Zeitpunkts als sortierbarer Schlüssel ("2026-08-19"). */
export function dayKey(d: Date): string {
  return dayKeyFormat.format(d);
}

/**
 * Erster und letzter Kalendertag, die ein halboffenes Intervall berührt.
 * Das Ende ist exklusiv: ein Einsatz bis 00:00 zählt den Folgetag nicht mit.
 * Tages-Schlüssel sind lexikographisch = chronologisch sortierbar und pro
 * Intervall lückenlos — deshalb genügt der Vergleich der Randtage.
 */
export function dayRange(range: ConflictRange): { first: string; last: string } {
  const first = dayKey(range.start);
  const lastMs = Math.max(range.start.getTime(), range.end.getTime() - 1);
  const last = dayKey(new Date(lastMs));
  return { first, last: last < first ? first : last };
}

/** Berühren zwei Zeitfenster mindestens einen gemeinsamen Kalendertag? */
export function sharesCalendarDay(a: ConflictRange, b: ConflictRange): boolean {
  const ra = dayRange(a);
  const rb = dayRange(b);
  return ra.first <= rb.last && rb.first <= ra.last;
}

/**
 * Schwere des Konflikts zweier Zeitfenster — null, wenn sie sich weder
 * überschneiden noch einen Kalendertag teilen.
 */
export function conflictSeverity(
  a: ConflictRange,
  b: ConflictRange
): ConflictSeverity | null {
  if (rangesOverlap(a.start, a.end, b.start, b.end)) return "OVERLAP";
  return sharesCalendarDay(a, b) ? "SAME_DAY" : null;
}

/** Die schwerere zweier Bewertungen (OVERLAP > SAME_DAY > keine). */
export function worseSeverity(
  a: ConflictSeverity | null,
  b: ConflictSeverity | null
): ConflictSeverity | null {
  if (a === "OVERLAP" || b === "OVERLAP") return "OVERLAP";
  if (a === "SAME_DAY" || b === "SAME_DAY") return "SAME_DAY";
  return null;
}

/** Ein Konflikt-Treffer: welches Projekt, wie schwer. */
export interface ConflictHit {
  projectName: string;
  severity: ConflictSeverity;
}

/**
 * Bewertet ein Zeitfenster gegen alle Fremd-Belegungen derselben Ressource.
 * Pro Projekt bleibt nur der schwerste Treffer übrig (ein Projekt kann eine
 * Person mehrfach einplanen), sortiert: Überschneidungen zuerst.
 */
export function collectConflicts(
  candidate: ConflictRange,
  busy: { projectName: string; start: Date; end: Date }[]
): ConflictHit[] {
  const worst = new Map<string, ConflictSeverity>();
  for (const b of busy) {
    const severity = conflictSeverity(candidate, b);
    if (!severity) continue;
    const current = worst.get(b.projectName) ?? null;
    worst.set(b.projectName, worseSeverity(current, severity) as ConflictSeverity);
  }
  return [...worst.entries()]
    .map(([projectName, severity]) => ({ projectName, severity }))
    .sort((x, y) => {
      if (x.severity !== y.severity) return x.severity === "OVERLAP" ? -1 : 1;
      return x.projectName.localeCompare(y.projectName, "de");
    });
}

/** Schwerster Treffer einer Liste — steuert Badge-Farbe und -Text. */
export function maxSeverity(hits: ConflictHit[]): ConflictSeverity | null {
  return hits.reduce<ConflictSeverity | null>(
    (acc, h) => worseSeverity(acc, h.severity),
    null
  );
}
