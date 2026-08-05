// Effektive Zeiträume von Personal-Einsätzen — EINE Fallback-Kette für
// Projektseite, Kalender, ICS-Feed, /einsatz und Überbuchungs-Prüfung:
//   1) explizite Uhrzeiten (plannedStart/End)
//   2) gewählter Berechnungszeitraum — MIT dessen Uhrzeiten, falls gepflegt
//      (Zeiträume werden per datetime-local erfasst und tragen echte Zeiten)
//   3) Projekt-Planungszeitraum (analog)
// Nur Zeiträume, die auf 00:00–00:00 stehen, gelten als ganztägig.

export interface EffectiveRangeInput {
  plannedStart: Date | null;
  plannedEnd: Date | null;
  billingPeriod?: { start: Date; end: Date } | null;
  projectPlanningStart: Date;
  projectPlanningEnd: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const APP_TZ = "Europe/Berlin";

/** Trägt der Zeitpunkt eine echte Uhrzeit (Berlin-Wanduhr ≠ 00:00)? */
export function hasClockTime(d: Date): boolean {
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: APP_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return hour !== "00" || get("minute") !== "00";
}

/**
 * Effektiver Zeitraum eines Einsatzes als halboffenes Intervall [start, end).
 * Zeitgenau (timed), wenn Uhrzeiten gesetzt sind ODER der zugrunde liegende
 * Zeitraum welche trägt. Ganztägige Einsätze laufen bis ENDE des letzten
 * Tages (end + 1 Tag), damit Überlappungsprüfungen den letzten Tag abdecken.
 */
export function assignmentEffectiveRange(a: EffectiveRangeInput): {
  start: Date;
  end: Date;
  timed: boolean;
} {
  if (a.plannedStart && a.plannedEnd) {
    return { start: a.plannedStart, end: a.plannedEnd, timed: true };
  }
  const base = a.billingPeriod ?? {
    start: a.projectPlanningStart,
    end: a.projectPlanningEnd,
  };
  if (hasClockTime(base.start) || hasClockTime(base.end)) {
    return { start: base.start, end: base.end, timed: true };
  }
  return {
    start: base.start,
    end: new Date(base.end.getTime() + DAY_MS),
    timed: false,
  };
}

/**
 * Geplante Arbeitsminuten eines Einsatzes: Länge des effektiven Zeitfensters,
 * sofern es zeitgenau ist. Ganztägige Einsätze (Zeitraum ohne Uhrzeiten)
 * liefern 0 — daraus lässt sich keine Stundenzahl ableiten.
 */
export function effectivePlannedMinutes(a: EffectiveRangeInput): number {
  const r = assignmentEffectiveRange(a);
  if (!r.timed) return 0;
  return Math.max(0, Math.round((+r.end - +r.start) / 60000));
}

/** Überlappung zweier halboffener Intervalle [aStart, aEnd) und [bStart, bEnd). */
export function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart < bEnd && bStart < aEnd;
}
