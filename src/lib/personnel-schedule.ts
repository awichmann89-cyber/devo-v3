// Effektive Zeiträume von Personal-Einsätzen — EINE Fallback-Kette für
// Projektseite, Kalender, ICS-Feed, /einsatz und Überbuchungs-Prüfung:
//   1) explizite Uhrzeiten (plannedStart/End)
//   2) gewählter Berechnungszeitraum (ganztägig)
//   3) Projekt-Planungszeitraum (ganztägig, Altverhalten)

export interface EffectiveRangeInput {
  plannedStart: Date | null;
  plannedEnd: Date | null;
  billingPeriod?: { start: Date; end: Date } | null;
  projectPlanningStart: Date;
  projectPlanningEnd: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Effektiver Zeitraum eines Einsatzes als halboffenes Intervall [start, end).
 * Ganztägige Einsätze laufen bis ENDE des letzten Tages (end + 1 Tag),
 * damit Überlappungsprüfungen den letzten Tag mit abdecken.
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
  return {
    start: base.start,
    end: new Date(base.end.getTime() + DAY_MS),
    timed: false,
  };
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
