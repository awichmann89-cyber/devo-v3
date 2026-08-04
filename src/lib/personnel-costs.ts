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

/** Personalkosten eines Projekts aus Einsatzplan (Freelancer) + Ist-Zeiten (Minijobber). */
export function personnelCostForProject(input: {
  assignments: { agreedRate: number | null }[];
  timeEntries: {
    startMinute: number;
    endMinute: number;
    breakMinutes: number;
    hourlyWageSnapshot: number | null;
  }[];
}): { freelancerCost: number; timeCost: number; total: number } {
  const freelancerCost = input.assignments.reduce(
    (sum, a) => sum + (a.agreedRate ?? 0),
    0
  );
  const timeCost = input.timeEntries.reduce(
    (sum, e) => sum + timeEntryCost(e),
    0
  );
  return { freelancerCost, timeCost, total: freelancerCost + timeCost };
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
