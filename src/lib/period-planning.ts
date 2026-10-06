/**
 * Tag-basierte Hilfen für Planungs- und Berechnungszeiträume.
 *
 * Grundannahmen:
 *  - Planungs-Ende liegt nach Planungs-Start.
 *  - Berechnungszeiträume liegen (tageweise) im Planungszeitraum.
 *  - Für den Mietpreis zählen nur ganze Tage (`daysBetween`), deshalb wird ein
 *    Berechnungstag als 00:00–23:59 gespeichert.
 *
 * Alle Funktionen rechnen in lokaler Zeit des Browsers.
 */

export const DEFAULT_PLAN_START_TIME = "08:00";
export const DEFAULT_PLAN_END_TIME = "18:00";

const pad = (n: number) => String(n).padStart(2, "0");

/** Lokales Datum als Schlüssel `YYYY-MM-DD`. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Ganze Kalendertage zwischen zwei Daten (DST-sicher). */
export function dayDiff(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86_400_000);
}

/** Alle Kalendertage von `start` bis einschließlich `end`. */
export function eachDay(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const n = dayDiff(start, end);
  for (let i = 0; i <= n; i++) out.push(addDays(startOfDay(start), i));
  return out;
}

/** `HH:MM` eines Datums. */
export function timeOf(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Setzt die Uhrzeit `HH:MM` auf den Kalendertag von `day`. */
export function withTime(day: Date, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0);
}

/** Wert für `<input type="datetime-local">` bzw. internen State. */
export function toLocalInput(d?: Date | string | null): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "";
  return `${dayKey(dt)}T${timeOf(dt)}`;
}

export function parseLocalInput(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Berechnungszeitraum über ganze Tage: erster Tag 00:00 bis letzter Tag 23:59. */
export function fullDayPeriod(first: Date, last: Date): { start: Date; end: Date } {
  return {
    start: startOfDay(first),
    end: new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59),
  };
}

/**
 * Vorschlag für den Berechnungstag: der mittlere Tag des Planungszeitraums,
 * bei gerader Anzahl der spätere der beiden mittleren (1 Tag → 1., 2 → 2.,
 * 3 → 2., 4 → 3.).
 */
export function suggestBillingDay(planStart: Date, planEnd: Date): { start: Date; end: Date } {
  const days = eachDay(planStart, planEnd);
  const day = days[Math.floor(days.length / 2)] ?? startOfDay(planStart);
  return fullDayPeriod(day, day);
}

/**
 * Erster und letzter Kalendertag eines Zeitraums. Endet er genau um 00:00,
 * zählt der Folgetag nicht mehr mit (z. B. „bis Mitternacht").
 */
export function dayBounds(start: Date, end: Date): { first: Date; last: Date } {
  const first = startOfDay(start);
  let last = startOfDay(end);
  if (end.getHours() === 0 && end.getMinutes() === 0 && dayDiff(first, last) > 0) {
    last = addDays(last, -1);
  }
  return { first, last };
}

/**
 * Passt einen Zeitraum tageweise an einen neuen Planungszeitraum an: liegt er
 * teilweise draußen, wird er gekürzt; liegt er ganz draußen, fällt er weg
 * (Rückgabe null).
 */
export function clampPeriodToPlanning(
  period: { start: Date; end: Date },
  planStart: Date,
  planEnd: Date
): { start: Date; end: Date } | null {
  const { first, last } = dayBounds(period.start, period.end);
  const pFirst = startOfDay(planStart);
  const pLast = startOfDay(planEnd);
  if (dayDiff(last, pFirst) > 0 || dayDiff(pLast, first) > 0) return null;
  const start = dayDiff(first, pFirst) > 0 ? startOfDay(pFirst) : period.start;
  const end =
    dayDiff(pLast, last) > 0 ? fullDayPeriod(pLast, pLast).end : period.end;
  return { start, end };
}

function isSameDayPeriod(a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean {
  return dayKey(a.start) === dayKey(b.start) && dayKey(a.end) === dayKey(b.end);
}

/**
 * Zieht die Berechnungszeiträume nach, wenn sich der Planungszeitraum ändert:
 *  - Ist nur der vorgeschlagene Berechnungstag gesetzt, wird er neu
 *    vorgeschlagen (Mitte des neuen Planungszeitraums).
 *  - Wurde der Planungszeitraum nur verschoben (gleiche Tagesanzahl), wandern
 *    alle Zeiträume um dieselbe Anzahl Tage mit.
 *  - Sonst werden sie auf den neuen Planungszeitraum gekürzt; was ganz
 *    herausfällt, entfällt. Bleibt nichts übrig, gilt wieder der Vorschlag.
 */
export function adaptPeriodsToPlanning<T extends { start: Date; end: Date }>(
  periods: T[],
  oldPlan: { start: Date; end: Date } | null,
  newPlan: { start: Date; end: Date }
): T[] {
  const suggestion = suggestBillingDay(newPlan.start, newPlan.end);
  if (periods.length === 0) return periods;

  if (oldPlan) {
    const oldSuggestion = suggestBillingDay(oldPlan.start, oldPlan.end);
    if (periods.length === 1 && isSameDayPeriod(periods[0], oldSuggestion)) {
      return [{ ...periods[0], ...suggestion }];
    }
    const oldLen = dayDiff(oldPlan.start, oldPlan.end);
    const newLen = dayDiff(newPlan.start, newPlan.end);
    const shift = dayDiff(oldPlan.start, newPlan.start);
    if (oldLen === newLen && shift !== 0) {
      return periods.map((p) => ({
        ...p,
        start: addDays(p.start, shift),
        end: addDays(p.end, shift),
      }));
    }
  }

  const clamped = periods
    .map((p) => {
      const c = clampPeriodToPlanning(p, newPlan.start, newPlan.end);
      return c ? { ...p, ...c } : null;
    })
    .filter((p): p is T => p !== null);
  return clamped.length > 0 ? clamped : [{ ...periods[0], ...suggestion }];
}

function sortByStart<T extends { start: Date }>(periods: T[]): T[] {
  return [...periods].sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Schaltet einen Tag als Berechnungstag an oder aus. Angefasst wird nur der
 * betroffene Zeitraum — andere behalten ihre Uhrzeiten (und damit ihren Preis).
 *  - Aus: Tag am Rand → Zeitraum wird kürzer; Tag in der Mitte → Zeitraum wird
 *    geteilt; einziger Tag → Zeitraum entfällt (außer es ist der letzte).
 *  - An: direkt neben einem Zeitraum → der wird verlängert (zwischen zweien →
 *    beide verschmelzen); sonst entsteht ein neuer Ein-Tages-Zeitraum.
 */
export function toggleBillingDay<T extends { start: Date; end: Date }>(
  periods: T[],
  day: Date,
  make: (start: Date, end: Date) => T
): T[] {
  const d = startOfDay(day);
  const dayEnd = fullDayPeriod(d, d).end;
  const idx = periods.findIndex((p) => {
    const b = dayBounds(p.start, p.end);
    return dayDiff(b.first, d) >= 0 && dayDiff(d, b.last) >= 0;
  });

  if (idx >= 0) {
    const p = periods[idx];
    const { first, last } = dayBounds(p.start, p.end);
    const isFirst = dayDiff(first, d) === 0;
    const isLast = dayDiff(d, last) === 0;
    const rest = periods.filter((_, i) => i !== idx);
    if (isFirst && isLast) return periods.length > 1 ? rest : periods;
    if (isFirst) return sortByStart([...rest, { ...p, start: addDays(d, 1) }]);
    if (isLast) {
      const prev = addDays(d, -1);
      return sortByStart([...rest, { ...p, end: fullDayPeriod(prev, prev).end }]);
    }
    const prev = addDays(d, -1);
    const next = addDays(d, 1);
    return sortByStart([
      ...rest,
      { ...p, end: fullDayPeriod(prev, prev).end },
      make(next, p.end),
    ]);
  }

  const before = periods.findIndex((p) => dayDiff(dayBounds(p.start, p.end).last, d) === 1);
  const after = periods.findIndex((p) => dayDiff(d, dayBounds(p.start, p.end).first) === 1);
  if (before >= 0 && after >= 0) {
    const merged = { ...periods[before], end: periods[after].end };
    return sortByStart([
      ...periods.filter((_, i) => i !== before && i !== after),
      merged,
    ]);
  }
  if (before >= 0) {
    return periods.map((p, i) => (i === before ? { ...p, end: dayEnd } : p));
  }
  if (after >= 0) {
    return periods.map((p, i) => (i === after ? { ...p, start: d } : p));
  }
  return sortByStart([...periods, make(d, dayEnd)]);
}

/**
 * Verschiebt Start- und/oder Endtag eines Zeitraums um ganze Tage, Uhrzeiten
 * bleiben. Gibt null zurück, wenn das Ergebnis den Planungszeitraum verlässt,
 * sich mit einem anderen Zeitraum überschneidet oder Start nach Ende läge.
 */
export function shiftPeriod<T extends { start: Date; end: Date }>(
  periods: T[],
  index: number,
  startDelta: number,
  endDelta: number,
  plan: { start: Date; end: Date }
): T[] | null {
  const p = periods[index];
  const start = addDays(p.start, startDelta);
  const end = addDays(p.end, endDelta);
  const b = dayBounds(start, end);
  if (dayDiff(b.first, b.last) < 0 || end < start) return null;
  if (dayDiff(startOfDay(plan.start), b.first) < 0) return null;
  if (dayDiff(b.last, startOfDay(plan.end)) < 0) return null;
  const overlaps = periods.some((o, i) => {
    if (i === index) return false;
    const ob = dayBounds(o.start, o.end);
    return dayDiff(ob.first, b.last) >= 0 && dayDiff(b.first, ob.last) >= 0;
  });
  if (overlaps) return null;
  return sortByStart(periods.map((o, i) => (i === index ? { ...o, start, end } : o)));
}

/** Alle abgerechneten Tage (`YYYY-MM-DD`) der Zeiträume. */
export function billedDayKeys(periods: { start: Date; end: Date }[]): Set<string> {
  const keys = new Set<string>();
  for (const p of periods) {
    const { first, last } = dayBounds(p.start, p.end);
    for (const d of eachDay(first, last)) keys.add(dayKey(d));
  }
  return keys;
}
