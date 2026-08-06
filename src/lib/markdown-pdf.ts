/**
 * Zerlegt den Markdown-Text einer Notiz in Blöcke, die sich mit jsPDF zeichnen
 * lassen.
 *
 * Bewusst ein eigener, kleiner Zeilen-Parser statt remark/unified: Die PDF-
 * Ausgabe braucht nur die Blockstruktur (Überschrift, Liste, Aufgabe, Tabelle),
 * keinen vollständigen AST — und der Parser läuft damit ohne zusätzliche
 * Abhängigkeit in der Node-Runtime der API-Route.
 */

import { stripInline } from "@/lib/markdown-tasks";

export type MarkdownBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "listItem"; text: string; marker: string; depth: number }
  | { kind: "task"; text: string; done: boolean; depth: number }
  | { kind: "quote"; text: string }
  | { kind: "code"; text: string }
  | { kind: "rule" }
  | { kind: "table"; head: string[]; rows: string[][] };

const HEADING = /^(#{1,3})\s+(.*)$/;
const TASK = /^(\s*)(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s*(.*)$/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED = /^(\s*)(\d+)[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^\s*```/;
const TABLE_DELIMITER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/;

export function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === "") {
      flushParagraph();
      continue;
    }

    // Codeblock — bis zum schließenden Fence unverändert übernehmen.
    if (FENCE.test(line)) {
      flushParagraph();
      const code: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) code.push(lines[i++]);
      blocks.push({ kind: "code", text: code.join("\n") });
      continue;
    }

    // Tabelle — Kopfzeile plus Trennzeile, danach alle weiteren Pipe-Zeilen.
    if (line.includes("|") && TABLE_DELIMITER.test(lines[i + 1] ?? "")) {
      flushParagraph();
      const head = splitTableRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      i--;
      blocks.push({ kind: "table", head, rows });
      continue;
    }

    if (RULE.test(line)) {
      flushParagraph();
      blocks.push({ kind: "rule" });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3,
        text: stripInline(heading[2]),
      });
      continue;
    }

    const quote = QUOTE.exec(line);
    if (quote) {
      flushParagraph();
      blocks.push({ kind: "quote", text: stripInline(quote[1]) });
      continue;
    }

    const task = TASK.exec(line);
    if (task) {
      flushParagraph();
      blocks.push({
        kind: "task",
        done: task[2] !== " ",
        depth: indentDepth(task[1]),
        text: stripInline(task[3]),
      });
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      flushParagraph();
      blocks.push({
        kind: "listItem",
        marker: "•",
        depth: indentDepth(bullet[1]),
        text: stripInline(bullet[2]),
      });
      continue;
    }

    const ordered = ORDERED.exec(line);
    if (ordered) {
      flushParagraph();
      blocks.push({
        kind: "listItem",
        marker: `${ordered[2]}.`,
        depth: indentDepth(ordered[1]),
        text: stripInline(ordered[3]),
      });
      continue;
    }

    paragraph.push(stripInline(line));
  }

  flushParagraph();
  return blocks;
}

/** Zwei Leerzeichen (oder ein Tab) pro Ebene — so schreibt es der Editor. */
function indentDepth(indent: string): number {
  return Math.floor(indent.replace(/\t/g, "  ").length / 2);
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => stripInline(cell.trim()));
}

