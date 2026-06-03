/** Minimaler ICS-Builder für ganztägige Events. */

export interface IcsEvent {
  uid: string;
  /** Inklusiver Start als Date (Tagesgenau). */
  start: Date;
  /** Inklusives Ende als Date (Tagesgenau) — wird intern um 1 Tag nach hinten verschoben (ICS DTEND ist exklusiv). */
  end: Date;
  summary: string;
  description?: string;
  location?: string;
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

export function buildIcs(calendarName: string, events: IcsEvent[]): string {
  const now = new Date();
  const stamp = timestampUtc(now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//devo//Calendar//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `NAME:${escapeText(calendarName)}`,
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  for (const ev of events) {
    const endExclusive = addBerlinDays(ev.end, 1);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.uid}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART;VALUE=DATE:${dateOnly(ev.start)}`);
    lines.push(`DTEND;VALUE=DATE:${dateOnly(endExclusive)}`);
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
  return lines.join("\r\n") + "\r\n";
}
