"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Checkbox } from "@/components/ui/checkbox";
import { cn, formatDate } from "@/lib/utils";
import {
  findNoteTokens,
  type MentionCandidate,
  type NoteToken,
} from "@/lib/note-tasks";

/**
 * Gerenderte Markdown-Ausgabe (GFM: Tabellen, Aufgaben, Durchstreichen).
 *
 * Verzichtet bewusst auf @tailwindcss/typography — die Blockformate stehen hier
 * und decken sich mit denen des Editors (`MarkdownEditor`), damit Eingabe und
 * Anzeige gleich aussehen.
 *
 * Ist `onToggleTask` gesetzt, sind Aufgaben-Checkboxen klickbar: Die Zeilennummer
 * aus dem Markdown-Quelltext geht an den Aufrufer, der sie über
 * `toggleTaskLine()` umschaltet und speichert.
 */
export function MarkdownView({
  content,
  onToggleTask,
  people,
  className,
}: {
  content: string;
  /** `line` ist 1-basiert und zeigt auf die Aufgabenzeile im Markdown-Quelltext. */
  onToggleTask?: (line: number, checked: boolean) => void;
  /** Gesetzt → `@Name` und `!Datum` in Aufgaben werden als Chips dargestellt. */
  people?: MentionCandidate[];
  className?: string;
}) {
  return (
    <div className={cn("text-sm leading-relaxed", className)}>
      <ReactMarkdown
        remarkPlugins={
          people
            ? [remarkGfm, remarkBreaks, remarkNoteTokens(people)]
            : [remarkGfm, remarkBreaks]
        }
        components={{
          h1: ({ children }) => (
            <h1 className="mb-2 mt-4 text-xl font-bold first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-4 text-lg font-semibold first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h3>
          ),
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children, node }) =>
            hasClass(node, "contains-task-list") ? (
              // Aufgabenliste — die Punkte übernimmt die Checkbox.
              <ul className="mb-2 space-y-1 last:mb-0">{children}</ul>
            ) : (
              <ul className="mb-2 list-disc space-y-0.5 pl-5 last:mb-0">{children}</ul>
            ),
          ol: ({ children }) => (
            <ol className="mb-2 list-decimal space-y-0.5 pl-5 last:mb-0">{children}</ol>
          ),
          li: ({ children, node }) => {
            if (!hasClass(node, "task-list-item")) return <li>{children}</li>;

            const checked = isChecked(node);
            const line = startLine(node);
            const interactive = Boolean(onToggleTask) && line !== null;

            return (
              <li className="flex items-start gap-2">
                <Checkbox
                  checked={checked}
                  disabled={!interactive}
                  title={checked ? "Aufgabe wieder öffnen" : "Aufgabe abhaken"}
                  aria-label={checked ? "Aufgabe wieder öffnen" : "Aufgabe abhaken"}
                  className="mt-[3px] shrink-0"
                  onCheckedChange={(value) => {
                    if (line !== null) onToggleTask?.(line, value === true);
                  }}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1",
                    checked && "text-muted-foreground line-through"
                  )}
                >
                  {children}
                </span>
              </li>
            );
          },
          // Die Checkbox, die remark-gfm für Aufgaben erzeugt, ist fest
          // deaktiviert — wir rendern stattdessen die eigene im <li>.
          input: () => null,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:no-underline"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-2 border-l-2 border-muted-foreground/30 pl-3 italic text-muted-foreground">
              {children}
            </blockquote>
          ),
          code: ({ className: codeClassName, children, ...rest }) => {
            const isInline = !codeClassName;
            if (isInline) {
              return (
                <code
                  className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
                  {...rest}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={codeClassName} {...rest}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-2 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="mb-2 overflow-x-auto last:mb-0">
              <table className="w-full border-collapse rounded-md border text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-muted px-2 py-1 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-2 py-1 align-top">{children}</td>
          ),
          hr: () => <hr className="my-3 border-border" />,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          del: ({ children }) => (
            <del className="text-muted-foreground line-through">{children}</del>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* `@Name` und `!Datum` in Aufgabenzeilen als Chips darstellen.               */
/*                                                                            */
/* Läuft als remark-Plugin auf dem Markdown-Baum: Textknoten innerhalb einer  */
/* Aufgabe werden an den Kürzeln aufgetrennt. Bewusst nur in Aufgaben — im    */
/* Fließtext wäre ein "!12.07.2026" meist ein Datum und keine Frist.          */
/* -------------------------------------------------------------------------- */

type MdastNode = {
  type: string;
  value?: string;
  checked?: boolean | null;
  children?: MdastNode[];
  data?: Record<string, unknown>;
};

function remarkNoteTokens(people: MentionCandidate[]) {
  function tokenNode(token: NoteToken): MdastNode {
    const [label, classes, title] =
      token.kind === "mention"
        ? token.userId
          ? [`@${token.label}`, "bg-info-subtle text-info", undefined]
          : [
              `@${token.label}`,
              "bg-muted text-muted-foreground",
              "Kein Benutzer mit diesem Namen",
            ]
        : [formatDate(token.date), "bg-warning-subtle text-warning", "Fällig"];

    return {
      // Eigener Knotentyp: mdast-util-to-hast macht daraus über `hName` ein
      // <span> und übernimmt `hProperties` unverändert.
      type: "noteToken",
      data: {
        hName: "span",
        hProperties: {
          className: [
            "mx-px inline-flex items-center rounded-[5px] px-1 py-px text-[0.9em] font-semibold",
            classes,
          ],
          ...(title ? { title } : {}),
        },
      },
      children: [{ type: "text", value: label }],
    };
  }

  function split(value: string): MdastNode[] {
    const tokens = findNoteTokens(value, people);
    if (tokens.length === 0) return [{ type: "text", value }];

    const parts: MdastNode[] = [];
    let cursor = 0;
    for (const token of tokens) {
      if (token.start > cursor) {
        parts.push({ type: "text", value: value.slice(cursor, token.start) });
      }
      parts.push(tokenNode(token));
      cursor = token.end;
    }
    if (cursor < value.length) parts.push({ type: "text", value: value.slice(cursor) });
    return parts;
  }

  function walk(node: MdastNode, inTask: boolean) {
    // Nicht in bereits erzeugte Chips absteigen — sonst würde "@Alex" darin
    // erneut als Erwähnung erkannt und endlos weiter verpackt.
    if (node.type === "noteToken" || !node.children) return;

    const insideTask =
      inTask || (node.type === "listItem" && typeof node.checked === "boolean");

    if (insideTask) {
      node.children = node.children.flatMap((child) =>
        child.type === "text" && child.value ? split(child.value) : [child]
      );
    }
    for (const child of node.children) walk(child, insideTask);
  }

  return () => (tree: MdastNode) => walk(tree, false);
}

/* -------------------------------------------------------------------------- */
/* Zugriff auf den hast-Knoten, den react-markdown mitliefert.                 */
/* Bewusst defensiv typisiert — die Knotenform gehört zur Bibliothek.          */
/* -------------------------------------------------------------------------- */

type MarkdownNode = {
  properties?: { className?: unknown; checked?: unknown };
  children?: MarkdownNode[];
  tagName?: string;
  position?: { start?: { line?: number } };
};

function hasClass(node: unknown, name: string): boolean {
  const className = (node as MarkdownNode | undefined)?.properties?.className;
  return Array.isArray(className) && className.includes(name);
}

/** Der Zustand steckt in der Checkbox, die remark-gfm dem Listenpunkt voranstellt. */
function isChecked(node: unknown): boolean {
  const children = (node as MarkdownNode | undefined)?.children ?? [];
  const input = children.find((child) => child.tagName === "input");
  return input?.properties?.checked === true;
}

function startLine(node: unknown): number | null {
  const line = (node as MarkdownNode | undefined)?.position?.start?.line;
  return typeof line === "number" ? line : null;
}
