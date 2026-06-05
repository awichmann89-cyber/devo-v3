"use client";

import { useEffect, useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Plus, Pencil, Trash2, Loader2, StickyNote, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  createProjectNote,
  updateProjectNote,
  deleteProjectNote,
} from "./notes-actions";

export interface NoteVM {
  id: string;
  title: string;
  content: string;
  updatedAt: string | Date;
}

export function NotesSection({
  projectId,
  notes,
  canWrite,
}: {
  projectId: string;
  notes: NoteVM[];
  canWrite: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NoteVM | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<NoteVM | null>(null);
  const [pending, startTransition] = useTransition();

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(note: NoteVM) {
    setEditing(note);
    setDialogOpen(true);
  }

  function handleDelete() {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    startTransition(async () => {
      try {
        await deleteProjectNote(id);
        toast.success("Notiz gelöscht");
        setConfirmDelete(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler beim Löschen");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="default"
          onClick={() =>
            window.open(
              `/api/projects/${projectId}/notes.pdf`,
              "_blank"
            )
          }
          disabled={notes.length === 0}
          title={
            notes.length === 0
              ? "Erst eine Notiz anlegen"
              : "Notizen als PDF öffnen"
          }
        >
          <Printer className="h-4 w-4" /> Notizen drucken
        </Button>
        {canWrite && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Neue Notiz
          </Button>
        )}
      </div>

      {notes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
            <StickyNote className="h-8 w-8 opacity-40" />
            <p className="text-sm">Noch keine Notizen für dieses Projekt.</p>
            {canWrite && (
              <Button variant="outline" size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" /> Erste Notiz anlegen
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {notes.map((note) => (
            <Card key={note.id} className="flex flex-col">
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="text-base truncate">{note.title}</CardTitle>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Aktualisiert{" "}
                    {new Date(note.updatedAt).toLocaleDateString("de-DE", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </p>
                </div>
                {canWrite && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(note)}
                      title="Bearbeiten"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setConfirmDelete(note)}
                      title="Löschen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="flex-1">
                <MarkdownView content={note.content} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NoteDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        note={editing}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Notiz löschen?"
        description={
          confirmDelete && (
            <>
              Die Notiz <strong>{confirmDelete.title}</strong> wird unwiderruflich
              gelöscht.
            </>
          )
        }
        confirmLabel="Löschen"
        pending={pending}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function NoteDialog({
  open,
  onOpenChange,
  projectId,
  note,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  note: NoteVM | null;
}) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const [pending, startTransition] = useTransition();

  // Felder beim Öffnen oder Wechsel des Edit-Targets resetten
  useEffect(() => {
    if (open) {
      setTitle(note?.title ?? "");
      setContent(note?.content ?? "");
    }
  }, [open, note?.id, note?.title, note?.content]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();

    const t = title.trim();
    if (!t) {
      toast.error("Titel darf nicht leer sein");
      return;
    }
    if (!content.trim()) {
      toast.error("Inhalt darf nicht leer sein");
      return;
    }

    startTransition(async () => {
      try {
        if (note) {
          await updateProjectNote(note.id, { title: t, content });
          toast.success("Notiz aktualisiert");
        } else {
          await createProjectNote(projectId, { title: t, content });
          toast.success("Notiz angelegt");
        }
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{note ? "Notiz bearbeiten" : "Neue Notiz"}</DialogTitle>
          <DialogDescription>
            Beschreibung unterstützt Markdown (Überschriften, Listen, Links, Code,
            Tabellen).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="note-title">Titel</Label>
            <Input
              id="note-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              autoFocus
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Beschreibung</Label>
            <Tabs defaultValue="edit">
              <TabsList>
                <TabsTrigger value="edit">Bearbeiten</TabsTrigger>
                <TabsTrigger value="preview">Vorschau</TabsTrigger>
              </TabsList>
              <TabsContent value="edit">
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={14}
                  placeholder={
                    "# Überschrift\n\n- Stichpunkt 1\n- Stichpunkt 2\n\n**Wichtig:** ..."
                  }
                  className="font-mono text-sm"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Markdown: <code># Überschrift</code> · <code>**fett**</code> ·{" "}
                  <code>*kursiv*</code> · <code>- Liste</code> ·{" "}
                  <code>[Link](url)</code> · <code>`code`</code>
                </p>
              </TabsContent>
              <TabsContent value="preview">
                <div className="min-h-[260px] rounded-md border p-4">
                  {content.trim() ? (
                    <MarkdownView content={content} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Keine Vorschau — Beschreibung ist leer.
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {note ? "Speichern" : "Anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Markdown-Renderer mit Tailwind-Klassen für die wichtigsten Block-Elemente.
// Verzichtet bewusst auf @tailwindcss/typography, um keine zusätzliche Abhängigkeit einzuführen.
function MarkdownView({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
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
          ul: ({ children }) => (
            <ul className="mb-2 list-disc space-y-0.5 pl-5 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 list-decimal space-y-0.5 pl-5 last:mb-0">{children}</ol>
          ),
          li: ({ children }) => <li>{children}</li>,
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
          code: ({ className, children, ...rest }) => {
            const isInline = !className;
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
              <code className={className} {...rest}>
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
            <div className="mb-2 overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b bg-muted/50 px-2 py-1 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b px-2 py-1 align-top">{children}</td>
          ),
          hr: () => <hr className="my-3 border-border" />,
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
