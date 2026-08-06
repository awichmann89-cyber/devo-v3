/**
 * Aufgaben (`- [ ] …`) in einem Markdown-Text umschalten und Inline-Auszeichnung
 * entfernen — die gemeinsame Textwerkstatt für Notizen.
 *
 * Die Zeilennummer stammt aus dem Markdown-AST der Vorschau (1-basiert). So kann
 * eine Checkbox direkt in der Notizliste abgehakt werden, ohne den kompletten
 * Inhalt durch den Editor zu schicken. Bewusst ohne Markdown-Parser, damit
 * Client (optimistisches Update) und Server (Persistenz) dieselbe Logik nutzen.
 */

/** "- [ ] Text", "* [x] Text", "1. [ ] Text" — Einrückung für Unterlisten erlaubt. */
const TASK_MARKER = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/;

export function isTaskLine(line: string): boolean {
  return TASK_MARKER.test(line);
}

/** Anzahl der Aufgaben und davon erledigte — für die Fortschrittsanzeige. */
export function countTasks(content: string): { total: number; done: number } {
  let total = 0;
  let done = 0;
  for (const line of content.split("\n")) {
    const match = TASK_MARKER.exec(line);
    if (!match) continue;
    total++;
    if (match[2] !== " ") done++;
  }
  return { total, done };
}

/**
 * Setzt den Haken in Zeile `line` (1-basiert) und gibt den neuen Inhalt zurück.
 *
 * `null`, wenn die Zeile nicht existiert oder keine Aufgabenzeile ist — dann hat
 * sich der Inhalt zwischenzeitlich geändert und der Aufrufer bricht ab, statt
 * eine beliebige andere Zeile zu überschreiben.
 */
export function toggleTaskLine(
  content: string,
  line: number,
  checked: boolean
): string | null {
  const lines = content.split("\n");
  const index = line - 1;
  const target = lines[index];
  if (target === undefined || !TASK_MARKER.test(target)) return null;

  lines[index] = target.replace(TASK_MARKER, `$1${checked ? "x" : " "}$3`);
  return lines.join("\n");
}

/**
 * Entfernt Inline-Auszeichnungen aus einer Zeile — für Ausgaben, die kein
 * Markdown rendern können (PDF, Aufgabenliste). Links behalten ihre Adresse in
 * Klammern, sonst wäre sie dort verloren.
 */
export function stripInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\\$/, "")
    .trim();
}
