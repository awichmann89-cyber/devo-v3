"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoHint } from "@/components/ui/info-hint";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RowAction, RowActions } from "@/components/ui/row-actions";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { MarkdownView } from "@/components/ui/markdown-view";
import { formatDate } from "@/lib/utils";
import { countTasks, toggleTaskLine } from "@/lib/markdown-tasks";
import type { MentionCandidate } from "@/lib/note-tasks";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Plus, Pencil, Trash2, Loader2, StickyNote, Download } from "lucide-react";
import { toast } from "sonner";
import {
  createProjectNote,
  updateProjectNote,
  deleteProjectNote,
  toggleProjectNoteTask,
} from "./notes-actions";
import { toastError } from "@/lib/toast";

export interface NoteVM {
  id: string;
  title: string;
  content: string;
  updatedAt: string | Date;
}

export function NotesSection({
  projectId,
  notes,
  people,
  canWrite,
}: {
  projectId: string;
  notes: NoteVM[];
  /** Erwähnbare Benutzer für `@Name` in Aufgaben. */
  people: MentionCandidate[];
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
        toastError(err, "Löschen");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          asChild
          size="sm"
          variant="default"
          disabled={notes.length === 0}
        >
          <a
            href={`/api/projects/${projectId}/notes.pdf?download=1`}
            download
            rel="noopener"
            title={
              notes.length === 0
                ? "Erst eine Notiz anlegen"
                : "Notizen herunterladen"
            }
            aria-disabled={notes.length === 0}
            onClick={(e) => {
              if (notes.length === 0) e.preventDefault();
            }}
          >
            <Download className="h-4 w-4" /> Notizen herunterladen
          </a>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2">
            <StickyNote className="h-4 w-4" /> Notizen
            {notes.length > 0 && (
              <Badge variant="outline">
                {notes.length} {notes.length === 1 ? "Notiz" : "Notizen"}
              </Badge>
            )}
          </CardTitle>
          {canWrite && (
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Notiz anlegen
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {notes.length === 0 ? (
            <EmptyState
              bare
              icon={StickyNote}
              title="Noch keine Notizen für dieses Projekt."
              action={
                canWrite && (
                  <Button variant="outline" size="sm" onClick={openCreate}>
                    <Plus className="h-4 w-4" /> Erste Notiz anlegen
                  </Button>
                )
              }
            />
          ) : (
            /* Notizen als abgesetzte Blöcke — keine verschachtelten Cards,
               sonst liegt Rahmen auf Rahmen. */
            <ul className="divide-y rounded-lg border">
              {notes.map((note) => (
                <NoteItem
                  key={note.id}
                  note={note}
                  people={people}
                  canWrite={canWrite}
                  onEdit={() => openEdit(note)}
                  onDelete={() => setConfirmDelete(note)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <NoteDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        note={editing}
        people={people}
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

/**
 * Eine Notiz in der Liste. Aufgaben lassen sich hier direkt abhaken — der neue
 * Stand wird sofort angezeigt und im Hintergrund gespeichert.
 */
function NoteItem({
  note,
  people,
  canWrite,
  onEdit,
  onDelete,
}: {
  note: NoteVM;
  people: MentionCandidate[];
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Sobald der Server den neuen Stand geliefert hat, zählt wieder er.
  useEffect(() => setOptimistic(null), [note.content]);

  const content = optimistic ?? note.content;
  const tasks = countTasks(content);

  function handleToggleTask(line: number, checked: boolean) {
    const next = toggleTaskLine(content, line, checked);
    if (next === null) return;

    setOptimistic(next);
    startTransition(async () => {
      try {
        await toggleProjectNoteTask(note.id, line, checked);
      } catch (err) {
        setOptimistic(null);
        toastError(err, "Speichern");
      }
    });
  }

  return (
    <li className="p-4">
      <div className="flex flex-row items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-base font-bold leading-tight tracking-tight">
            {note.title}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-[11px] text-muted-foreground">
              Aktualisiert {formatDate(note.updatedAt)}
            </p>
            {tasks.total > 0 && (
              <Badge
                size="sm"
                variant={tasks.done === tasks.total ? "success" : "outline"}
              >
                {tasks.done}/{tasks.total} erledigt
              </Badge>
            )}
          </div>
        </div>
        {canWrite && (
          <RowActions density="comfortable" className="shrink-0">
            <RowAction icon={Pencil} label="Bearbeiten" onClick={onEdit} />
            <RowAction
              icon={Trash2}
              label="Löschen"
              destructive
              onClick={onDelete}
            />
          </RowActions>
        )}
      </div>
      <div className="mt-3">
        <MarkdownView
          content={content}
          people={people}
          onToggleTask={canWrite ? handleToggleTask : undefined}
        />
      </div>
    </li>
  );
}

function NoteDialog({
  open,
  onOpenChange,
  projectId,
  note,
  people,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  note: NoteVM | null;
  people: MentionCandidate[];
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
        toastError(err, "Speichern");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{note ? "Notiz bearbeiten" : "Notiz anlegen"}</DialogTitle>
          <DialogDescription>
            Text wird direkt formatiert angezeigt — inklusive Tabellen und
            Aufgaben zum Abhaken.
          </DialogDescription>
        </DialogHeader>

        {/* Das Formular übernimmt die Flex-Spalte des Dialogs, damit der
            Editor scrollt und der Footer stehen bleibt. */}
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
          <DialogBody className="space-y-4">
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
              <div className="flex items-center gap-1.5">
                <Label>Beschreibung</Label>
                <InfoHint
                  text={
                    <>
                      Formatierung über die Leiste oder per Tastatur:{" "}
                      <code># </code> Überschrift · <code>- </code> Liste ·{" "}
                      <code>1. </code> Nummerierung · <code>&gt; </code> Zitat ·{" "}
                      <code>**fett**</code> · <code>*kursiv*</code>. Aufgaben und
                      Tabellen legst du über die Leiste an; in der Tabelle
                      wechselt <code>Tab</code> zur nächsten Zelle.
                      <br />
                      In einer Aufgabe weist <code>@Name</code> sie einem
                      Benutzer zu und <code>!20.08.2026</code> setzt eine Frist —
                      beides landet auf der Seite „Aufgaben“.
                    </>
                  }
                />
              </div>
              <MarkdownEditor
                value={content}
                onChange={setContent}
                label="Beschreibung"
                people={people}
                disabled={pending}
                placeholder="Notiz schreiben…"
              />
            </div>
          </DialogBody>

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
