// Personalkosten aus dem Einsatzplan — EINE Quelle für alle Aggregationsstellen
// (Projekt-Detail, Kosten-Tab, Forecast). Rein interne Kosten, erscheinen nie
// auf Kundendokumenten.
//
// Kostenlogik:
// - Freelancer: PersonAssignment.agreedRate (vereinbarter Gesamtsatz pro Einsatz)
// - Minijobber: TimeEntry-Minuten × hourlyWageSnapshot (Lohn zum Erfassungszeitpunkt)
// - Gesellschafter/Mitarbeiter: kein Snapshot/kein Satz gesetzt → 0

/** Netto-Arbeitsminuten eines Eintrags. endMinute < startMinute ⇒ über Mitternacht (+1440). */
export function workedMinutes(entry: {
  startMinute: number;
  endMinute: number;
  breakMinutes: number;
}): number {
  let end = entry.endMinute;
  if (end < entry.startMinute) end += 1440;
  return Math.max(0, end - entry.startMinute - entry.breakMinutes);
}

/** Kosten eines Zeiteintrags (0 wenn kein Lohn-Snapshot gesetzt ist). */
export function timeEntryCost(entry: {
  startMinute: number;
  endMinute: number;
  breakMinutes: number;
  hourlyWageSnapshot: number | null;
}): number {
  if (entry.hourlyWageSnapshot == null) return 0;
  return (workedMinutes(entry) / 60) * entry.hourlyWageSnapshot;
}

export interface AssignmentCostInput {
  /** Pauschale/Tagessatz (gesamt) — direkt kostenwirksam. */
  agreedRate: number | null;
  /** Stundensatz des Einsatzes (Freelancer nach Stunden). */
  hourlyRate: number | null;
  isMinijobber: boolean;
  /** Stundenlohn aus dem Personalstamm (Minijobber). */
  personHourlyWage: number | null;
  /** Geplante Minuten aus dem effektiven Zeitfenster (0 = unbekannt). */
  plannedMinutes: number;
  /** Ist-Minuten aus erfassten Zeiten. */
  loggedMinutes: number;
  /** Ist-Kosten aus erfassten Zeiten (Stunden × Lohn-Snapshot). */
  timeCost: number;
}

/**
 * Kosten und Stunden eines Einsatzes:
 * Pauschale > Ist-Zeiten > geplante Stunden × Satz (Vorschau, solange keine
 * Zeiten erfasst sind). `planned` markiert die Plan-Vorschau.
 */
export function assignmentCost(a: AssignmentCostInput): {
  minutes: number;
  cost: number;
  planned: boolean;
} {
  if (a.agreedRate != null) {
    return { minutes: a.loggedMinutes, cost: a.agreedRate, planned: false };
  }
  if (a.loggedMinutes > 0) {
    return { minutes: a.loggedMinutes, cost: a.timeCost, planned: false };
  }
  const rate = a.hourlyRate ?? (a.isMinijobber ? a.personHourlyWage : null);
  if (rate != null && a.plannedMinutes > 0) {
    return {
      minutes: a.plannedMinutes,
      cost: (a.plannedMinutes / 60) * rate,
      planned: true,
    };
  }
  return { minutes: 0, cost: 0, planned: false };
}

/** Minuten → "7:30"-Anzeige (für Stunden-Badges, Summen, Stundenzettel). */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Minuten seit Mitternacht → "HH:MM" (Wanduhr, für Formulare und PDF). */
export function minutesToClock(minutes: number): string {
  const clamped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "HH:MM" → Minuten seit Mitternacht. */
export function clockToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}
