/** Minimaler ICS-Builder für ganztägige und zeitgenaue Events. */

export interface IcsEvent {
  uid: string;
  /** Inklusiver Start als Date (tagesgenau; bei `timed` der exakte Zeitpunkt). */
  start: Date;
  /** Inklusives Ende als Date (tagesgenau) — wird intern um 1 Tag nach hinten verschoben (ICS DTEND ist exklusiv). Bei `timed` der exakte Endzeitpunkt OHNE Verschiebung. */
  end: Date;
  summary: string;
  description?: string;
  location?: string;
  /** true = zeitgenaues Event (DTSTART;TZID=Europe/Berlin), sonst ganztägig. */
  timed?: boolean;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

const APP_TZ = "Europe/Berlin";

/** YYYYMMDD im Anwendungs-Timezone (Europe/Berlin), unabhängig vom Server-TZ. */
function dateOnly(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}`;
}

/** Datum in Europe/Berlin um N Tage verschieben (preserved als ISO-Date-Only). */
function addBerlinDays(d: Date, days: number): Date {
  const yyyymmdd = dateOnly(d);
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const day = Number(yyyymmdd.slice(6, 8));
  // Konstruiere im UTC-Mittag, dann addiere Tage — vermeidet TZ-Shifts.
  const utc = new Date(Date.UTC(y, m - 1, day + days, 12));
  return utc;
}

/** YYYYMMDDTHHMMSS als Wanduhrzeit in Europe/Berlin (für DTSTART;TZID=…). */
function dateTimeBerlin(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  // Intl liefert für Mitternacht je nach Runtime "24" — auf "00" normalisieren.
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}${get("month")}${get("day")}T${hour}${get("minute")}${get("second")}`;
}

// Statische VTIMEZONE-Definition für Europe/Berlin (RFC 5545 verlangt sie,
// sobald ein DTSTART eine TZID referenziert). Die RRULEs decken die
// EU-Sommerzeitregel ab — konstant, kein Neuberechnen nötig.
const VTIMEZONE_BERLIN = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Berlin",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

function timestampUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/**
 * RFC-5545-Zeilenfaltung: Content-Lines dürfen max. 75 Oktette lang sein,
 * längere werden mit CRLF + Leerzeichen umgebrochen. Muss auf UTF-8-Byte-Basis
 * zählen und darf Mehrbyte-Zeichen (Umlaute, Emojis) nicht zerschneiden —
 * sonst zeigen iOS/Apple Kalender lange Beschreibungen kaputt an.
 */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const segments: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const ch of line) {
    const chBytes = encoder.encode(ch).length;
    // Fortsetzungszeilen beginnen mit einem Leerzeichen, das mitzählt.
    const max = segments.length === 0 ? 75 : 74;
    if (currentBytes + chBytes > max) {
      segments.push(current);
      current = ch;
      currentBytes = chBytes;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  if (current) segments.push(current);
  return segments.join("\r\n ");
}

export function buildIcs(calendarName: string, events: IcsEvent[]): string {
  const now = new Date();
  const stamp = timestampUtc(now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//cratel//Calendar//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `NAME:${escapeText(calendarName)}`,
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  // VTIMEZONE nur ausgeben, wenn mindestens ein Event eine TZID referenziert —
  // die bestehenden ganztägigen Feeds bleiben so byte-identisch.
  if (events.some((ev) => ev.timed)) {
    lines.push(...VTIMEZONE_BERLIN);
  }
  for (const ev of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.uid}`);
    lines.push(`DTSTAMP:${stamp}`);
    if (ev.timed) {
      // Zeitgenaues Event: exakte Zeiten, DTEND ohne +1-Tag-Verschiebung
      // (die Exklusiv-Verschiebung gilt nur für VALUE=DATE).
      lines.push(`DTSTART;TZID=Europe/Berlin:${dateTimeBerlin(ev.start)}`);
      lines.push(`DTEND;TZID=Europe/Berlin:${dateTimeBerlin(ev.end)}`);
    } else {
      const endExclusive = addBerlinDays(ev.end, 1);
      lines.push(`DTSTART;VALUE=DATE:${dateOnly(ev.start)}`);
      lines.push(`DTEND;VALUE=DATE:${dateOnly(endExclusive)}`);
    }
    lines.push(`SUMMARY:${escapeText(ev.summary)}`);
    if (ev.description) {
      lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
    }
    if (ev.location) {
      lines.push(`LOCATION:${escapeText(ev.location)}`);
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
