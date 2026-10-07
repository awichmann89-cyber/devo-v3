/**
 * Tag-basierte Hilfen für Planungs- und Berechnungszeiträume.
 *
 * Grundannahmen:
 *  - Planungs-Ende liegt nach Planungs-Start.
 *  - Berechnungszeiträume liegen (tageweise) im Planungszeitraum.
 *  - Für den Mietpreis zählt die Dauer in angefangenen 24 h (`daysBetween`).
 *    Ein ganztägiger Berechnungszeitraum wird deshalb als erster Tag 00:00 bis
 *    letzter Tag 23:59 gespeichert; die Personalplanung erkennt das als
 *    ganztägig.
 *  - Mit Uhrzeiten (z. B. für die Personalplanung) beginnt er am ersten Tag
 *    zur Start- und endet am letzten Tag zur End-Uhrzeit. Liegt die End- nicht
 *    nach der Start-Uhrzeit, endet er am Folgetag (18:00–02:00). So ergibt die
 *    Dauer immer genau die Anzahl der Tage.
 *
 * Alle Funktionen rechnen in lokaler Zeit des Browsers.
 */

export const DEFAULT_PLAN_START_TIME = "08:00";
export const DEFAULT_PLAN_END_TIME = "18:00";
export const ALL_DAY_END_TIME = "23:59";

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

/** Uhrzeiten eines Berechnungszeitraums; null = ganztägig. */
export type PeriodTimes = { start: string; end: string } | null;

/** Endet die Uhrzeit-Spanne am Folgetag (Ende nicht nach Start)? */
export function isOvernight(times: PeriodTimes): boolean {
  return !!times && times.end <= times.start;
}

/** Zeitraum aus erstem/letztem Tag und Uhrzeiten. */
export function buildPeriod(
  first: Date,
  last: Date,
  times: PeriodTimes
): { start: Date; end: Date } {
  if (!times) return { start: startOfDay(first), end: withTime(last, ALL_DAY_END_TIME) };
  const end = withTime(last, times.end);
  return {
    start: withTime(first, times.start),
    end: isOvernight(times) ? addDays(end, 1) : end,
  };
}

/** Berechnungszeitraum über ganze Tage: erster Tag 00:00 bis letzter Tag 23:59. */
export function fullDayPeriod(first: Date, last: Date): { start: Date; end: Date } {
  return buildPeriod(first, last, null);
}

/**
 * Erster und letzter Kalendertag eines Zeitraums. Liegt die End- nicht nach
 * der Start-Uhrzeit, gehört der Endtag nicht mehr dazu (Nachtschicht bzw. „bis
 * Mitternacht"). So passt die Tagesanzahl zur Preisberechnung.
 */
export function dayBounds(start: Date, end: Date): { first: Date; last: Date } {
  const first = startOfDay(start);
  let last = startOfDay(end);
  if (dayDiff(first, last) > 0 && timeOf(end) <= timeOf(start)) last = addDays(last, -1);
  return { first, last };
}

/** Uhrzeiten eines gespeicherten Zeitraums; ganztägig (auch Altdaten 00:00–00:00) → null. */
export function periodTimes(p: { start: Date; end: Date }): PeriodTimes {
  const st = timeOf(p.start);
  const et = timeOf(p.end);
  if (st === "00:00" && (et === ALL_DAY_END_TIME || et === "00:00")) return null;
  return { start: st, end: et };
}

/** Gleicher Zeitraum auf anderen Tagen, Uhrzeiten bleiben. */
export function withDays<T extends { start: Date; end: Date }>(p: T, first: Date, last: Date): T {
  return { ...p, ...buildPeriod(first, last, periodTimes(p)) };
}

/** Gleiche Tage mit anderen Uhrzeiten. */
export function withPeriodTimes<T extends { start: Date; end: Date }>(p: T, times: PeriodTimes): T {
  const { first, last } = dayBounds(p.start, p.end);
  return { ...p, ...buildPeriod(first, last, times) };
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
 * Passt einen Zeitraum tageweise an einen neuen Planungszeitraum an: liegt er
 * teilweise draußen, wird er gekürzt; liegt er ganz draußen, fällt er weg
 * (Rückgabe null). Uhrzeiten bleiben.
 */
export function clampPeriodToPlanning<T extends { start: Date; end: Date }>(
  period: T,
  planStart: Date,
  planEnd: Date
): T | null {
  const { first, last } = dayBounds(period.start, period.end);
  const pFirst = startOfDay(planStart);
  const pLast = startOfDay(planEnd);
  if (dayDiff(last, pFirst) > 0 || dayDiff(pLast, first) > 0) return null;
  if (dayDiff(first, pFirst) <= 0 && dayDiff(pLast, last) <= 0) return period;
  return withDays(
    period,
    dayDiff(first, pFirst) > 0 ? pFirst : first,
    dayDiff(pLast, last) > 0 ? pLast : last
  );
}

/**
 * Zieht die Berechnungszeiträume nach, wenn sich der Planungszeitraum ändert:
 *  - Ist nur der vorgeschlagene Berechnungstag gesetzt, wird er neu
 *    vorgeschlagen (Mitte des neuen Planungszeitraums).
 *  - Wurde der Planungszeitraum nur verschoben (gleiche Tagesanzahl), wandern
 *    alle Zeiträume um dieselbe Anzahl Tage mit.
 *  - Sonst werden sie auf den neuen Planungszeitraum gekürzt; was ganz
 *    herausfällt, entfällt. Bleibt nichts übrig, gilt wieder der Vorschlag.
 * Uhrzeiten bleiben in allen Fällen erhalten.
 */
export function adaptPeriodsToPlanning<T extends { start: Date; end: Date }>(
  periods: T[],
  oldPlan: { start: Date; end: Date } | null,
  newPlan: { start: Date; end: Date }
): T[] {
  if (periods.length === 0) return periods;
  const suggested = startOfDay(suggestBillingDay(newPlan.start, newPlan.end).start);

  if (oldPlan) {
    const oldSuggested = startOfDay(suggestBillingDay(oldPlan.start, oldPlan.end).start);
    const b = dayBounds(periods[0].start, periods[0].end);
    if (
      periods.length === 1 &&
      dayDiff(b.first, oldSuggested) === 0 &&
      dayDiff(b.last, oldSuggested) === 0
    ) {
      return [withDays(periods[0], suggested, suggested)];
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
    .map((p) => clampPeriodToPlanning(p, newPlan.start, newPlan.end))
    .filter((p): p is T => p !== null);
  return clamped.length > 0 ? clamped : [withDays(periods[0], suggested, suggested)];
}

function sortByStart<T extends { start: Date }>(periods: T[]): T[] {
  return [...periods].sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Neuer Zeitraum aus Tagen und Uhrzeiten über die Fabrik des Aufrufers. */
function makeFrom<T>(
  make: (start: Date, end: Date) => T,
  first: Date,
  last: Date,
  times: PeriodTimes
): T {
  const b = buildPeriod(first, last, times);
  return make(b.start, b.end);
}

/**
 * Schaltet einen Tag als Berechnungstag an oder aus. Angefasst wird nur der
 * betroffene Zeitraum — andere behalten Tage und Uhrzeiten.
 *  - Aus: Tag am Rand → Zeitraum wird kürzer; Tag in der Mitte → Zeitraum wird
 *    geteilt; einziger Tag → Zeitraum entfällt (außer es ist der letzte).
 *  - An: direkt neben einem Zeitraum → der wird verlängert (zwischen zweien →
 *    beide verschmelzen); sonst entsteht ein neuer ganztägiger Zeitraum.
 */
export function toggleBillingDay<T extends { start: Date; end: Date }>(
  periods: T[],
  day: Date,
  make: (start: Date, end: Date) => T
): T[] {
  const d = startOfDay(day);
  const bounds = periods.map((p) => dayBounds(p.start, p.end));
  const idx = bounds.findIndex((b) => dayDiff(b.first, d) >= 0 && dayDiff(d, b.last) >= 0);

  if (idx >= 0) {
    const p = periods[idx];
    const { first, last } = bounds[idx];
    const isFirst = dayDiff(first, d) === 0;
    const isLast = dayDiff(d, last) === 0;
    const rest = periods.filter((_, i) => i !== idx);
    if (isFirst && isLast) return periods.length > 1 ? rest : periods;
    if (isFirst) return sortByStart([...rest, withDays(p, addDays(d, 1), last)]);
    if (isLast) return sortByStart([...rest, withDays(p, first, addDays(d, -1))]);
    return sortByStart([
      ...rest,
      withDays(p, first, addDays(d, -1)),
      makeFrom(make, addDays(d, 1), last, periodTimes(p)),
    ]);
  }

  const before = bounds.findIndex((b) => dayDiff(b.last, d) === 1);
  const after = bounds.findIndex((b) => dayDiff(d, b.first) === 1);
  if (before >= 0 && after >= 0) {
    const merged = withDays(periods[before], bounds[before].first, bounds[after].last);
    return sortByStart([...periods.filter((_, i) => i !== before && i !== after), merged]);
  }
  if (before >= 0) {
    return periods.map((p, i) => (i === before ? withDays(p, bounds[i].first, d) : p));
  }
  if (after >= 0) {
    return periods.map((p, i) => (i === after ? withDays(p, d, bounds[i].last) : p));
  }
  return sortByStart([...periods, makeFrom(make, d, d, null)]);
}

/** Trennt einen Zeitraum zwischen `day` und dem Folgetag; beide Teile behalten die Uhrzeiten. */
export function splitPeriodAfter<T extends { start: Date; end: Date }>(
  periods: T[],
  index: number,
  day: Date,
  make: (start: Date, end: Date) => T
): T[] {
  const p = periods[index];
  const { first, last } = dayBounds(p.start, p.end);
  const d = startOfDay(day);
  if (dayDiff(first, d) < 0 || dayDiff(d, last) <= 0) return periods;
  return sortByStart([
    ...periods.filter((_, i) => i !== index),
    withDays(p, first, d),
    makeFrom(make, addDays(d, 1), last, periodTimes(p)),
  ]);
}

/** Teilt einen mehrtägigen Zeitraum in einzelne Tage mit denselben Uhrzeiten. */
export function splitIntoDays<T extends { start: Date; end: Date }>(
  periods: T[],
  index: number,
  make: (start: Date, end: Date) => T
): T[] {
  const p = periods[index];
  const { first, last } = dayBounds(p.start, p.end);
  const times = periodTimes(p);
  const [firstDay, ...others] = eachDay(first, last);
  return sortByStart([
    ...periods.filter((_, i) => i !== index),
    withDays(p, firstDay, firstDay),
    ...others.map((d) => makeFrom(make, d, d, times)),
  ]);
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
  const cur = dayBounds(p.start, p.end);
  const first = addDays(cur.first, startDelta);
  const last = addDays(cur.last, endDelta);
  if (dayDiff(first, last) < 0) return null;
  if (dayDiff(startOfDay(plan.start), first) < 0) return null;
  if (dayDiff(last, startOfDay(plan.end)) < 0) return null;
  const overlaps = periods.some((o, i) => {
    if (i === index) return false;
    const ob = dayBounds(o.start, o.end);
    return dayDiff(ob.first, last) >= 0 && dayDiff(first, ob.last) >= 0;
  });
  if (overlaps) return null;
  return sortByStart(periods.map((o, i) => (i === index ? withDays(o, first, last) : o)));
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

/** Kurzform für den Kalenderbalken: „18–02" bzw. „18:30–02". */
export function shortTimes(times: PeriodTimes): string {
  if (!times) return "";
  const h = (t: string) => (t.endsWith(":00") ? t.slice(0, 2) : t);
  return `${h(times.start)}–${h(times.end)}`;
}
