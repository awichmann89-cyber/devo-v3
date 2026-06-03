"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Upload, FileText, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { uploadLetterhead, deleteLetterhead } from "./letterhead-actions";
import { LetterheadKind } from "@prisma/client";

interface TemplateInfo {
  kind: LetterheadKind;
  fileName: string;
  updatedAt: string; // ISO
}

interface Props {
  first: TemplateInfo | null;
  following: TemplateInfo | null;
}

export function LetterheadForm({ first, following }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Slot
        kind="FIRST_PAGE"
        title="Erste Seite"
        description="Briefpapier für Seite 1 der Rechnung. Üblicherweise mit Logo, Absender und Briefkopf."
        info={first}
      />
      <Slot
        kind="FOLLOWING_PAGES"
        title="Folgeseiten"
        description="Briefpapier für alle weiteren Seiten. Üblicherweise nur Fußzeile oder ein dezentes Logo."
        info={following}
      />
    </div>
  );
}

function Slot({
  kind,
  title,
  description,
  info,
}: {
  kind: LetterheadKind;
  title: string;
  description: string;
  info: TemplateInfo | null;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      try {
        await uploadLetterhead(kind, fd);
        toast.success("Briefpapier hochgeladen");
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler beim Hochladen");
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteLetterhead(kind);
        toast.success("Briefpapier entfernt");
        setConfirmDelete(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {info ? (
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{info.fileName}</div>
                <div className="text-[11px] text-muted-foreground">
                  hochgeladen am{" "}
                  {new Date(info.updatedAt).toLocaleDateString("de-DE", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </div>
              </div>
              <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                <a
                  href={`/api/letterhead/${kind}`}
                  target="_blank"
                  rel="noopener"
                  title="Anzeigen"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
                title="Entfernen"
                disabled={pending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            Noch kein Briefpapier hinterlegt.
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleFileChange}
            disabled={pending}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {info ? "Andere Datei wählen …" : "PDF hochladen …"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Nur PDF, max. 10 MB
          </p>
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Briefpapier entfernen?"
        description={
          info && (
            <>
              Die Datei <strong>{info.fileName}</strong> wird gelöscht. Neue
              Rechnungen werden ohne dieses Briefpapier erstellt.
            </>
          )
        }
        confirmLabel="Entfernen"
        pending={pending}
        onConfirm={handleDelete}
      />
    </Card>
  );
}
