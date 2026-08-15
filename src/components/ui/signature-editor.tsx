"use client";

import * as React from "react";
import { useEditor, useEditorState, EditorContent } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Bold, Italic, Underline as UnderlineIcon, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const SIGNATURE_COLORS = ["#18181b", "#F45B28", "#1e3a8a", "#15803d", "#b91c1c"];

// Schriftgröße als eigenständiges Attribut auf der textStyle-Mark — Tiptap
// hat dafür kein stabiles Kern-Paket, das Muster (globalAttribute + Inline-
// Style) ist aber der dokumentierte Standardweg.
// Radix' <Select.Item> verbietet einen leeren value-String (der ist für die
// interne Placeholder-Logik reserviert) — "default" steht daher stellvertretend
// für "kein fontSize-Attribut gesetzt" und wird beim Anwenden auf "" gemappt.
const DEFAULT_FONT_SIZE = "default";
const FONT_SIZES = [
  { label: "Klein", value: "12px" },
  { label: "Normal", value: DEFAULT_FONT_SIZE },
  { label: "Groß", value: "16px" },
  { label: "Größer", value: "18px" },
  { label: "Sehr groß", value: "24px" },
];

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

const FontSize = Extension.create({
  name: "fontSize",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.fontSize || null,
            renderHTML: (attributes: { fontSize?: string | null }) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: null }).run(),
    };
  },
});

/**
 * Schlanker Rich-Text-Editor für die persönliche E-Mail-Signatur: Fett,
 * Kursiv, Unterstrichen und Textfarbe. Speichert als HTML (nicht Markdown —
 * Farbe lässt sich in Markdown nicht abbilden), das beim E-Mail-Versand
 * direkt unter den Nachrichtentext gesetzt wird.
 */
export function SignatureEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        link: false,
      }),
      TextStyle,
      Color,
      FontSize,
    ],
    content: value || "<p></p>",
    editorProps: {
      attributes: {
        class: "focus:outline-none min-h-[80px] text-sm",
        spellcheck: "true",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "E-Mail-Signatur",
      },
    },
    onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
  });

  // Von außen gesetzte Werte übernehmen (z.B. nach dem Laden vom Server).
  React.useEffect(() => {
    if (!editor) return;
    if (value === editor.getHTML()) return;
    editor.commands.setContent(value || "<p></p>", { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Aktive Marken an der aktuellen Selektion — über useEditorState statt
  // editor.isActive() direkt im Render, damit z.B. reines Klicken in bereits
  // formatierten Text (ohne Tippen) die Toolbar sofort synchron hält.
  const marks = useEditorState({
    editor,
    selector: ({ editor: instance }) =>
      instance
        ? {
            bold: instance.isActive("bold"),
            italic: instance.isActive("italic"),
            underline: instance.isActive("underline"),
            color: (instance.getAttributes("textStyle").color as string | undefined) ?? "",
            fontSize:
              (instance.getAttributes("textStyle").fontSize as string | undefined) ||
              DEFAULT_FONT_SIZE,
          }
        : null,
  });

  if (!editor || !marks) return null;

  return (
    <div className="rounded-md border">
      <div className="flex flex-wrap items-center gap-1 border-b p-1.5">
        <ToolbarButton
          icon={Bold}
          label="Fett"
          active={marks.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          icon={Italic}
          label="Kursiv"
          active={marks.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          icon={UnderlineIcon}
          label="Unterstrichen"
          active={marks.underline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <div className="mx-1 h-5 w-px bg-border" />
        <Select
          value={marks.fontSize}
          onValueChange={(v) => {
            if (v === DEFAULT_FONT_SIZE) {
              editor.chain().focus().unsetFontSize().run();
            } else {
              editor.chain().focus().setFontSize(v).run();
            }
          }}
        >
          <SelectTrigger
            className="h-8 w-[110px] px-2 text-xs"
            aria-label="Schriftgröße"
          >
            <SelectValue placeholder="Normal" />
          </SelectTrigger>
          <SelectContent>
            {FONT_SIZES.map((s) => (
              <SelectItem key={s.label} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="mx-1 h-5 w-px bg-border" />
        {SIGNATURE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            aria-label={`Textfarbe ${c}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().setColor(c).run()}
            className={cn(
              "h-6 w-6 rounded-full border border-input",
              marks.color === c && "ring-2 ring-ring ring-offset-1"
            )}
            style={{ backgroundColor: c }}
          />
        ))}
        <input
          type="color"
          title="Eigene Farbe"
          aria-label="Eigene Textfarbe wählen"
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          className="h-6 w-6 cursor-pointer rounded-md border border-input bg-transparent p-0"
        />
        <ToolbarButton
          icon={RotateCcw}
          label="Farbe zurücksetzen"
          onClick={() => editor.chain().focus().unsetColor().run()}
        />
      </div>
      <div className="p-3">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  active = false,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="iconSm"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(active && "bg-accent text-accent-foreground")}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
