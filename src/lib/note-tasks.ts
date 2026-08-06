import { stripInline } from "@/lib/markdown-tasks";

/**
 * Aufgabenverwaltung aus Projektnotizen.
 *
 * In einer Aufgabenzeile (`- [ ] …`) gelten zwei Kürzel:
 *   `@Name`        weist die Aufgabe einem Cratel-Benutzer zu
 *   `!20.08.2026`  setzt eine Frist (auch `!20.08.26` und `!2026-08-20`)
 *
 * Die Notiz bleibt die einzige Quelle — es gibt keine zweite Aufgabentabelle,
 * die auseinanderlaufen könnte. Die Seite /tasks liest die Notizen und wertet
 * sie mit diesen Funktionen aus.
 *
 * Läuft ohne Datenbank und ohne DOM, damit Editor (Hervorhebung), Anzeige
 * (Chips) und Server (Aufgabenliste) exakt dieselbe Erkennung verwenden.
 */

/** Zeichen, das eine Frist einleitet. */
export const DUE_PREFIX = "!";

/** Ein erwähnbarer Benutzer. `name` ist der Anzeigename, wie er getippt wird. */
export interface MentionCandidate {
  id: string;
  name: string;
}

export type NoteToken =
  | {
      kind: "mention";
      start: number;
      end: number;
      label: string;
      /** `null`, wenn der Name zu keinem Benutzer passt. */
      userId: string | null;
    }
  | {
      kind: "due";
      start: number;
      end: number;
      label: string;
      date: Date;
    };

export interface ParsedNoteTask {
  /** 1-basierte Zeile im Markdown-Quelltext — Schlüssel fürs Abhaken. */
  line: number;
  done: boolean;
  /** Aufgabentext ohne Kürzel und ohne Markdown-Auszeichnung. */
  text: string;
  dueDate: Date | null;
  /** Benutzer-IDs aller aufgelösten Erwähnungen, ohne Dopplungen. */
  assigneeIds: string[];
  /** Alle Erwähnungen so, wie sie dastehen — auch die unbekannten. */
  mentions: { label: string; userId: string | null }[];
}

// "- [ ] Text", "1. [x] Text" — Einrückung für Unterlisten erlaubt.
const TASK_LINE = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s*(.*)$/;
const DUE_VALUE = /^(?:\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2}))/;
// Fallback für @Namen, die zu keinem Benutzer passen — damit der Schreibende
// sieht, dass die Erwähnung nicht gegriffen hat.
const LOOSE_MENTION = /^[\p{L}\p{N}_.-]+/u;

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}]/u.test(char);
}

/**
 * Wandelt `20.08.2026`, `20.08.26` oder `2026-08-20` in ein Datum um
 * (UTC-Mitternacht wie bei `TimeEntry.workDate`). `null` bei Unfug wie 31.02.
 */
export function parseDueDate(value: string): Date | null {
  let year: number;
  let month: number;
  let day: number;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else {
    const german = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(value);
    if (!german) return null;
    [day, month] = [Number(german[1]), Number(german[2])];
    year = Number(german[3]);
    // Zweistellig heißt in diesem Jahrhundert — "26" ist 2026, nicht 1926.
    if (german[3].length === 2) year += 2000;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return valid ? date : null;
}

/**
 * Findet alle Kürzel in einem Text. Namen dürfen Leerzeichen enthalten, deshalb
 * wird der längste passende Benutzername zuerst geprüft — sonst würde bei
 * "Alex" und "Alex Wichmann" immer der kürzere gewinnen.
 */
export function findNoteTokens(
  text: string,
  people: MentionCandidate[]
): NoteToken[] {
  const candidates = [...people].sort((a, b) => b.name.length - a.name.length);
  const tokens: NoteToken[] = [];
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    const startsToken =
      (char === "@" || char === DUE_PREFIX) && !isWordChar(text[i - 1]);

    if (!startsToken) {
      i++;
      continue;
    }

    if (char === "@") {
      const match = candidates.find((person) => {
        const slice = text.slice(i + 1, i + 1 + person.name.length);
        return (
          slice.toLowerCase() === person.name.toLowerCase() &&
          !isWordChar(text[i + 1 + person.name.length])
        );
      });

      if (match) {
        const end = i + 1 + match.name.length;
        tokens.push({ kind: "mention", start: i, end, label: match.name, userId: match.id });
        i = end;
        continue;
      }

      const loose = LOOSE_MENTION.exec(text.slice(i + 1));
      if (loose) {
        const end = i + 1 + loose[0].length;
        tokens.push({ kind: "mention", start: i, end, label: loose[0], userId: null });
        i = end;
        continue;
      }
    } else {
      const value = DUE_VALUE.exec(text.slice(i + 1))?.[0];
      const date = value ? parseDueDate(value) : null;
      if (value && date) {
        const end = i + 1 + value.length;
        tokens.push({ kind: "due", start: i, end, label: value, date });
        i = end;
        continue;
      }
    }

    i++;
  }

  return tokens;
}

/** Text ohne die Kürzel — das, was in der Aufgabenliste stehen soll. */
export function textWithoutTokens(raw: string, tokens: NoteToken[]): string {
  let out = "";
  let cursor = 0;
  for (const token of tokens) {
    out += raw.slice(cursor, token.start);
    cursor = token.end;
  }
  out += raw.slice(cursor);
  return stripInline(out.replace(/\s+/g, " "));
}

/** Alle Aufgaben einer Notiz mit Zuweisung und Frist. */
export function parseNoteTasks(
  content: string,
  people: MentionCandidate[]
): ParsedNoteTask[] {
  const tasks: ParsedNoteTask[] = [];

  content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .forEach((line, index) => {
      const match = TASK_LINE.exec(line);
      if (!match) return;

      const raw = match[2];
      const tokens = findNoteTokens(raw, people);
      const due = tokens.find((t) => t.kind === "due");
      const mentions = tokens.filter((t) => t.kind === "mention");

      tasks.push({
        line: index + 1,
        done: match[1] !== " ",
        text: textWithoutTokens(raw, tokens),
        dueDate: due?.kind === "due" ? due.date : null,
        assigneeIds: [
          ...new Set(
            mentions.flatMap((m) => (m.kind === "mention" && m.userId ? [m.userId] : []))
          ),
        ],
        mentions: mentions.map((m) => ({
          label: m.label,
          userId: m.kind === "mention" ? m.userId : null,
        })),
      });
    });

  return tasks;
}

/** Anzeigename eines Benutzers — `name` ist optional, dann muss die Mail her. */
export function userLabel(user: { name: string | null; email: string }): string {
  return user.name?.trim() || user.email;
}

/**
 * Der heutige Kalendertag in Europe/Berlin als UTC-Mitternacht — dieselbe
 * Darstellung, die `parseDueDate` liefert, sodass sich beide direkt vergleichen
 * lassen.
 *
 * Wird auf dem Server berechnet und an die Seite gereicht: Würde der Client
 * "heute" selbst bestimmen, könnten Server- und Client-Rendering an der
 * Tagesgrenze auseinanderlaufen.
 */
export function todayInAppTimezone(now: Date = new Date()): Date {
  // en-CA liefert YYYY-MM-DD.
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${day}T00:00:00.000Z`);
}
