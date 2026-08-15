"use client";

import * as React from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Bold, Italic, Underline as UnderlineIcon, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SIGNATURE_COLORS = ["#18181b", "#F45B28", "#1e3a8a", "#15803d", "#b91c1c"];

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

  if (!editor) return null;

  return (
    <div className="rounded-md border">
      <div className="flex flex-wrap items-center gap-1 border-b p-1.5">
        <ToolbarButton
          icon={Bold}
          label="Fett"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          icon={Italic}
          label="Kursiv"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          icon={UnderlineIcon}
          label="Unterstrichen"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
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
              editor.isActive("textStyle", { color: c }) &&
                "ring-2 ring-ring ring-offset-1"
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
