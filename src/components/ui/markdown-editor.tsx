"use client";

import * as React from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import type { ResolvedPos } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import {
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  AtSign,
  Bold,
  Code,
  Columns3,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  PanelTop,
  Quote,
  Redo2,
  Rows3,
  Strikethrough,
  Table as TableIcon,
  Trash2,
  Undo2,
  Unlink,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { findNoteTokens, type MentionCandidate } from "@/lib/note-tasks";

// tiptap-markdown legt seinen Serializer unter `editor.storage.markdown` ab,
// meldet das aber nicht am Storage-Interface von TipTap an.
declare module "@tiptap/core" {
  interface Storage {
    markdown: MarkdownStorage;
  }
}

/**
 * WYSIWYG-Editor für Markdown-Inhalte (Notizen).
 *
 * Eingabe und Vorschau sind dasselbe Feld: Getipptes erscheint sofort formatiert,
 * Markdown ist nur noch das Speicherformat. `value`/`onChange` arbeiten deshalb
 * weiterhin mit Markdown — die Übersetzung übernimmt `tiptap-markdown`.
 *
 * Die Blockformate sind in globals.css unter `.markdown-editor` hinterlegt und
 * decken sich mit denen von `MarkdownView`.
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  label,
  people,
  disabled = false,
  className,
}: {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  /** Name des Felds für Screenreader — das Eingabefeld ist kein <textarea>. */
  label: string;
  /**
   * Erwähnbare Benutzer. Gesetzt → `@` öffnet eine Vorschlagsliste, und `@Name`
   * sowie `!Datum` werden in Aufgabenzeilen farbig hervorgehoben.
   */
  people?: MentionCandidate[];
  disabled?: boolean;
  className?: string;
}) {
  // Der Editor wird einmal erzeugt; über den Ref sehen seine Plugins trotzdem
  // immer die aktuelle Benutzerliste.
  const peopleRef = React.useRef<MentionCandidate[]>(people ?? []);
  peopleRef.current = people ?? [];

  // Der Editor wird einmal erzeugt — Tastendrücke müssen deshalb über einen Ref
  // an den jeweils aktuellen Zustand der Vorschlagsliste kommen.
  const keyHandlerRef = React.useRef<(event: KeyboardEvent) => boolean>(() => false);

  const editor = useEditor({
    // Next rendert die Komponente auch auf dem Server vor — TipTap braucht das DOM.
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        },
      }),
      TaskListWithTightAttribute,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: true } }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      Markdown.configure({
        // Kein Roh-HTML: Die Anzeige (MarkdownView) rendert ebenfalls kein HTML —
        // was hier nicht als Markdown ausdrückbar ist, wäre dort unsichtbar.
        html: false,
        breaks: true,
        linkify: false,
        bulletListMarker: "-",
        transformPastedText: true,
        transformCopiedText: true,
      }),
      ...(people
        ? [NoteTokenHighlight.configure({ getPeople: () => peopleRef.current })]
        : []),
    ],
    content: value,
    editorProps: {
      handleKeyDown: (_view, event) => keyHandlerRef.current(event),
      attributes: {
        class: "focus:outline-none",
        spellcheck: "true",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChange(instance.storage.markdown.getMarkdown());
    },
  });

  // Von außen gesetzte Werte übernehmen (Dialog öffnet mit anderer Notiz).
  // Beim Tippen greift der Vergleich nicht, weil `value` dann schon dem
  // serialisierten Stand entspricht.
  React.useEffect(() => {
    if (!editor) return;
    if (value === editor.storage.markdown.getMarkdown()) return;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  React.useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  /* ---- Kürzel-Hilfen: @ öffnet die Benutzerliste, ! die Datumsauswahl ---- */

  const [dismissedFrom, setDismissedFrom] = React.useState<number | null>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);

  const query = useEditorState({
    editor,
    selector: ({ editor: instance }) =>
      instance ? findSuggestion(instance, Boolean(people?.length)) : null,
  });

  const matches = React.useMemo(() => {
    if (query?.kind !== "mention" || !people) return [];
    const needle = query.query.trim().toLowerCase();
    return people
      .filter((person) => person.name.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [query, people]);

  const visible =
    query !== null && query.from !== dismissedFrom && !disabled
      ? query.kind === "mention" && matches.length > 0
        ? "mention"
        : query.kind === "due"
          ? "due"
          : null
      : null;

  React.useEffect(() => setActiveIndex(0), [query?.from, query?.query]);

  // Virtueller Anker an der Schreibmarke. Bei jeder Cursorbewegung ein neues
  // Objekt, damit Radix die Blase nachführt statt am alten Rechteck zu kleben.
  // `new DOMRect` steckt bewusst im Callback — beim Rendern auf dem Server
  // gibt es die Klasse nicht.
  const caretAnchorRef = React.useRef<{ getBoundingClientRect: () => DOMRect }>({
    getBoundingClientRect: () => new DOMRect(),
  });
  caretAnchorRef.current = React.useMemo(
    () => ({
      getBoundingClientRect: () =>
        new DOMRect(
          query?.left ?? 0,
          query?.top ?? 0,
          1,
          (query?.bottom ?? 0) - (query?.top ?? 0)
        ),
    }),
    [query?.left, query?.top, query?.bottom]
  );

  const replaceQuery = React.useCallback(
    (text: string) => {
      if (!editor || !query) return;
      editor
        .chain()
        .focus()
        .insertContentAt({ from: query.from, to: query.to }, text)
        .run();
      setDismissedFrom(null);
    },
    [editor, query]
  );

  keyHandlerRef.current = (event) => {
    if (!visible || !query) return false;

    // Ausblenden merken wir uns an der Position des Kürzels — solange der
    // Cursor an diesem `@`/`!` weiterschreibt, bleibt die Hilfe zu.
    if (event.key === "Escape") {
      setDismissedFrom(query.from);
      return true;
    }

    // Bei der Datumsauswahl bleiben alle anderen Tasten beim Editor: Wer das
    // Datum lieber tippt, soll nicht ausgebremst werden.
    if (visible !== "mention") return false;

    switch (event.key) {
      case "ArrowDown":
        setActiveIndex((i) => (i + 1) % matches.length);
        return true;
      case "ArrowUp":
        setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
        return true;
      case "Enter":
      case "Tab":
        replaceQuery(`@${matches[Math.min(activeIndex, matches.length - 1)].name} `);
        return true;
      default:
        return false;
    }
  };

  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) => {
      if (!instance) return null;
      return {
        bold: instance.isActive("bold"),
        italic: instance.isActive("italic"),
        strike: instance.isActive("strike"),
        code: instance.isActive("code"),
        h1: instance.isActive("heading", { level: 1 }),
        h2: instance.isActive("heading", { level: 2 }),
        h3: instance.isActive("heading", { level: 3 }),
        bulletList: instance.isActive("bulletList"),
        orderedList: instance.isActive("orderedList"),
        taskList: instance.isActive("taskList"),
        blockquote: instance.isActive("blockquote"),
        link: instance.isActive("link"),
        inTable: instance.isActive("table"),
        canUndo: instance.can().undo(),
        canRedo: instance.can().redo(),
      };
    },
  });

  return (
    <div
      className={cn(
        "markdown-editor overflow-hidden rounded-md border border-input bg-card focus-within:border-primary",
        disabled && "opacity-50",
        className
      )}
    >
      {/* fieldset statt div: `disabled` sperrt alle enthaltenen Buttons mit,
          solange gespeichert wird. */}
      <fieldset
        disabled={disabled}
        className="flex flex-wrap items-center gap-0.5 border-b bg-secondary px-1.5 py-1"
      >
        <ToolbarButton
          icon={Undo2}
          label="Rückgängig"
          disabled={!state?.canUndo}
          onClick={() => editor?.chain().focus().undo().run()}
        />
        <ToolbarButton
          icon={Redo2}
          label="Wiederholen"
          disabled={!state?.canRedo}
          onClick={() => editor?.chain().focus().redo().run()}
        />
        <ToolbarDivider />
        <ToolbarButton
          icon={Heading1}
          label="Überschrift 1"
          active={state?.h1}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
        />
        <ToolbarButton
          icon={Heading2}
          label="Überschrift 2"
          active={state?.h2}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <ToolbarButton
          icon={Heading3}
          label="Überschrift 3"
          active={state?.h3}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        />
        <ToolbarDivider />
        <ToolbarButton
          icon={Bold}
          label="Fett"
          active={state?.bold}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          icon={Italic}
          label="Kursiv"
          active={state?.italic}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          icon={Strikethrough}
          label="Durchgestrichen"
          active={state?.strike}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
        />
        <ToolbarButton
          icon={Code}
          label="Code"
          active={state?.code}
          onClick={() => editor?.chain().focus().toggleCode().run()}
        />
        <ToolbarDivider />
        <ToolbarButton
          icon={List}
          label="Aufzählung"
          active={state?.bulletList}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          icon={ListOrdered}
          label="Nummerierte Liste"
          active={state?.orderedList}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          icon={ListTodo}
          label="Aufgabenliste"
          active={state?.taskList}
          onClick={() => editor?.chain().focus().toggleTaskList().run()}
        />
        <ToolbarButton
          icon={Quote}
          label="Zitat"
          active={state?.blockquote}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        />
        <ToolbarButton
          icon={Minus}
          label="Trennlinie"
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
        />
        <ToolbarDivider />
        {editor && <LinkControl editor={editor} active={Boolean(state?.link)} />}
        <ToolbarButton
          icon={Unlink}
          label="Link entfernen"
          disabled={!state?.link}
          onClick={() => editor?.chain().focus().extendMarkRange("link").unsetLink().run()}
        />
        <ToolbarButton
          icon={TableIcon}
          label="Tabelle einfügen"
          active={state?.inTable}
          onClick={() =>
            editor
              ?.chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        />
      </fieldset>

      {state?.inTable && editor && (
        <TableToolbar editor={editor} disabled={disabled} />
      )}

      <EditorContent editor={editor} />

      {/*
        Die Blasen laufen über das Popover-Primitive, nicht über ein eigenes
        Portal. Im Notiz-Dialog ist das der einzige Weg, der auch bedienbar ist:
        Radix' modaler Dialog setzt `pointer-events: none` auf den <body> und
        fängt den Fokus ein. Eine selbst portierte Blase wäre dort sichtbar,
        aber tot. Radix meldet das Popover dagegen als oberste Ebene an — sie
        bekommt `pointer-events: auto`, und die Fokus-Falle des Dialogs wird
        solange pausiert. Nebenbei erledigt Floating UI das Umklappen an den
        Bildschirmrändern.

        Der Anker ist virtuell: ein reines Rechteck an der Schreibmarke. Ein
        echtes Anker-Element im Editor käme nicht in Frage, weil `DialogContent`
        per `translate-x-[-50%]` verschoben ist.
      */}
      <Popover
        open={visible !== null}
        onOpenChange={(open) => {
          if (!open && query) setDismissedFrom(query.from);
        }}
      >
        <PopoverAnchor virtualRef={caretAnchorRef} />
        {visible && (
          <PopoverContent
            align="start"
            side="bottom"
            sideOffset={4}
            className="w-64 p-1"
            // Der Fokus muss im Editor bleiben — sonst bricht das Weitertippen ab.
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            {visible === "mention" ? (
              <ul role="listbox" aria-label="Benutzer erwähnen">
                {matches.map((person, index) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => replaceQuery(`@${person.name} `)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        index === activeIndex
                          ? "bg-accent text-accent-foreground"
                          : "text-popover-foreground"
                      )}
                    >
                      <AtSign className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{person.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <DuePicker
                onPick={(date) => replaceQuery(`!${formatDueValue(date)} `)}
                onDismiss={() => query && setDismissedFrom(query.from)}
              />
            )}
          </PopoverContent>
        )}
      </Popover>
    </div>
  );
}

/**
 * Datumsauswahl hinter dem `!`. Bewusst mit dem nativen Datumsfeld — dieselbe
 * Eingabe wie in der Filterleiste, und wer das Datum lieber tippt, schreibt
 * einfach weiter: Sobald hinter dem `!` eine Ziffer steht, verschwindet die
 * Auswahl von selbst.
 */
function DuePicker({
  onPick,
  onDismiss,
}: {
  onPick: (date: Date) => void;
  onDismiss: () => void;
}) {
  const today = new Date();

  const shortcuts: { label: string; date: Date }[] = [
    { label: "Heute", date: today },
    { label: "Morgen", date: addDays(today, 1) },
    { label: "In einer Woche", date: addDays(today, 7) },
  ];

  return (
    <div className="space-y-1.5 p-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Fällig am
        </span>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onDismiss}
          title="Ausblenden — nur ein Ausrufezeichen schreiben"
          aria-label="Datumsauswahl ausblenden"
          className="rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-0.5">
        {shortcuts.map((shortcut) => (
          <button
            key={shortcut.label}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(shortcut.date)}
            className="flex items-center justify-between gap-2 rounded-sm px-2 py-1 text-left text-[13px] text-popover-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span>{shortcut.label}</span>
            <span className="text-[11px] text-muted-foreground">
              {formatDueValue(shortcut.date)}
            </span>
          </button>
        ))}
      </div>

      <Input
        type="date"
        aria-label="Anderes Datum"
        size="sm"
        onChange={(e) => {
          const [year, month, day] = e.target.value.split("-").map(Number);
          if (!year || !month || !day) return;
          onPick(new Date(year, month - 1, day));
        }}
      />
      <p className="px-1 text-[10px] text-muted-foreground">
        Esc blendet aus · oder Datum direkt tippen
      </p>
    </div>
  );
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Tagesgenaues Datum als `20.08.2026` — so, wie es in der Notiz steht. */
function formatDueValue(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getFullYear()}`;
}

/**
 * Erkennt, ob direkt vor dem Cursor ein Kürzel getippt wird.
 *
 * `@`: Namen dürfen ein Leerzeichen enthalten ("Alex Wichmann"), der Ausdruck
 * endet aber bewusst auf einem Wortzeichen — nach dem Einfügen steht ein
 * Leerzeichen hinter dem Namen und die Liste schließt sich von selbst.
 *
 * `!`: nur das nackte Ausrufezeichen. Sobald eine Ziffer folgt, tippt jemand
 * das Datum selbst, und die Auswahl verschwindet ohne Zutun.
 */
const MENTION_QUERY = /(?:^|[\s(])@([\p{L}\p{N}_.-]*(?: [\p{L}\p{N}_.-]+)?)$/u;
const DUE_QUERY = /(?:^|[\s(])!$/;

interface CaretQuery {
  kind: "mention" | "due";
  from: number;
  to: number;
  query: string;
  left: number;
  top: number;
  bottom: number;
}

function findSuggestion(editor: Editor, hasPeople: boolean): CaretQuery | null {
  const { selection } = editor.state;
  if (!selection.empty) return null;

  const { $from } = selection;
  if (!$from.parent.isTextblock) return null;

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");

  const mention = hasPeople ? MENTION_QUERY.exec(textBefore) : null;
  // Die Datumsauswahl nur in Aufgaben: Außerhalb hat `!Datum` keine Bedeutung,
  // und im Fließtext wäre eine aufspringende Auswahl reine Störung.
  const due = DUE_QUERY.test(textBefore) && isInTaskItem(selection.$from);

  const kind: CaretQuery["kind"] | null = mention ? "mention" : due ? "due" : null;
  if (!kind) return null;

  const query = mention?.[1] ?? "";
  const to = selection.from;
  // Position des Kürzelzeichens selbst: Cursor minus Abfrage minus "@" bzw. "!".
  const from = to - query.length - 1;
  const coords = editor.view.coordsAtPos(from);

  return {
    kind,
    from,
    to,
    query,
    left: coords.left,
    top: coords.top,
    bottom: coords.bottom,
  };
}

function isInTaskItem($from: ResolvedPos): boolean {
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === "taskItem") return true;
  }
  return false;
}

/**
 * Hebt `@Name` und `!Datum` innerhalb von Aufgaben farbig hervor, damit beim
 * Schreiben sichtbar ist, ob die Erwähnung einen Benutzer getroffen hat.
 * Reine Darstellung — im Markdown steht weiterhin der getippte Text.
 */
const NoteTokenHighlight = Extension.create<{ getPeople: () => MentionCandidate[] }>({
  name: "noteTokenHighlight",

  addOptions() {
    return { getPeople: () => [] };
  },

  addProseMirrorPlugins() {
    const getPeople = this.options.getPeople;
    return [
      new Plugin({
        props: {
          decorations(state) {
            const people = getPeople();
            const decorations: Decoration[] = [];

            state.doc.descendants((node, pos) => {
              if (node.type.name !== "taskItem") return true;

              node.descendants((child, childPos) => {
                if (!child.isText || !child.text) return true;
                // Inhalt eines Knotens beginnt eine Position hinter ihm.
                const base = pos + 1 + childPos;
                for (const token of findNoteTokens(child.text, people)) {
                  decorations.push(
                    Decoration.inline(base + token.start, base + token.end, {
                      class:
                        token.kind === "due"
                          ? "note-token-due"
                          : token.userId
                            ? "note-token-mention"
                            : "note-token-unknown",
                    })
                  );
                }
                return true;
              });

              // Verschachtelte Aufgaben sind über node.descendants schon
              // mitgelaufen — von außen nicht noch einmal absteigen.
              return false;
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

/**
 * prosemirror-markdown entscheidet über `node.attrs.tight`, ob zwischen
 * Listenpunkten eine Leerzeile landet. tiptap-markdown setzt das Attribut nur
 * für Aufzählungen — ohne diese Ergänzung würde jede Aufgabe als eigener Absatz
 * serialisiert ("- [ ] a\n\n- [ ] b").
 */
const TaskListWithTightAttribute = TaskList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      tight: {
        default: true,
        parseHTML: (element) => element.getAttribute("data-tight") !== "false",
        renderHTML: (attributes) => ({
          "data-tight": attributes.tight ? "true" : "false",
        }),
      },
    };
  },
});

function TableToolbar({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  return (
    <fieldset
      disabled={disabled}
      className="flex flex-wrap items-center gap-0.5 border-b bg-muted px-1.5 py-1"
    >
      <span className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Tabelle
      </span>
      <ToolbarButton
        icon={ArrowLeftToLine}
        label="Spalte links einfügen"
        onClick={() => editor.chain().focus().addColumnBefore().run()}
      />
      <ToolbarButton
        icon={ArrowRightToLine}
        label="Spalte rechts einfügen"
        onClick={() => editor.chain().focus().addColumnAfter().run()}
      />
      <ToolbarButton
        icon={ArrowUpToLine}
        label="Zeile darüber einfügen"
        onClick={() => editor.chain().focus().addRowBefore().run()}
      />
      <ToolbarButton
        icon={ArrowDownToLine}
        label="Zeile darunter einfügen"
        onClick={() => editor.chain().focus().addRowAfter().run()}
      />
      <ToolbarDivider />
      <ToolbarButton
        icon={PanelTop}
        label="Kopfzeile umschalten"
        onClick={() => editor.chain().focus().toggleHeaderRow().run()}
      />
      <ToolbarDivider />
      <ToolbarButton
        icon={Columns3}
        label="Spalte löschen"
        destructive
        onClick={() => editor.chain().focus().deleteColumn().run()}
      />
      <ToolbarButton
        icon={Rows3}
        label="Zeile löschen"
        destructive
        onClick={() => editor.chain().focus().deleteRow().run()}
      />
      <ToolbarButton
        icon={Trash2}
        label="Tabelle löschen"
        destructive
        onClick={() => editor.chain().focus().deleteTable().run()}
      />
    </fieldset>
  );
}

function LinkControl({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [href, setHref] = React.useState("");

  function handleOpenChange(next: boolean) {
    if (next) setHref((editor.getAttributes("link").href as string | undefined) ?? "");
    setOpen(next);
  }

  function apply() {
    const url = href.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (url) chain.setLink({ href: url }).run();
    else chain.unsetLink().run();
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="iconSm"
          title="Link"
          aria-label="Link"
          aria-pressed={active}
          className={cn(active && "bg-accent text-accent-foreground")}
        >
          <LinkIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="space-y-2">
        <Label htmlFor="markdown-editor-link">Adresse</Label>
        <Input
          id="markdown-editor-link"
          value={href}
          onChange={(e) => setHref(e.target.value)}
          placeholder="https://…"
          autoFocus
          onKeyDown={(e) => {
            // Der Editor steckt in einem Formular — Enter darf nicht absenden.
            if (e.key !== "Enter") return;
            e.preventDefault();
            apply();
          }}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
            Abbrechen
          </Button>
          <Button type="button" size="sm" onClick={apply}>
            Übernehmen
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  destructive = false,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={destructive ? "ghostDestructive" : "ghost"}
      size="iconSm"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Ohne das verliert der Editor beim Klick die Auswahl und die Aktion
      // greift ins Leere.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(active && "bg-accent text-accent-foreground")}
    >
      <Icon />
    </Button>
  );
}

function ToolbarDivider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-border" />;
}
