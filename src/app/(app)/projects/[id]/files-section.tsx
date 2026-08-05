"use client";

import { useRef, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { UploadCloud, Download, Trash2, Loader2, FileText, Image as ImageIcon, FileArchive, File as FileIcon, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { uploadProjectFile, deleteProjectFile } from "./files-actions";
import { cn, formatDate } from "@/lib/utils";

type FileVM = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  blobUrl: string;
  uploadedAt: string;
  uploadedBy: { name: string | null; email: string } | null;
};

interface Props {
  projectId: string;
  files: FileVM[];
  canWrite: boolean;
}

export function FilesSection({ projectId, files, canWrite }: Props) {
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FileVM | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadOne(file: File) {
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Datei ist größer als 50 MB", { description: file.name });
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    try {
      await uploadProjectFile(projectId, formData);
      toast.success("Datei hochgeladen", { description: file.name });
    } catch (e) {
      toast.error("Upload fehlgeschlagen", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function handleFiles(list: FileList | File[]) {
    const arr = Array.from(list);
    if (arr.length === 0) return;
    setUploading(true);
    try {
      // Sequentiell, damit Toasts und Reihenfolge gewahrt bleiben
      for (const f of arr) {
        await uploadOne(f);
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    const name = deleteTarget.name;
    startTransition(async () => {
      try {
        await deleteProjectFile(id);
        toast.success("Datei gelöscht", { description: name });
        setDeleteTarget(null);
      } catch (e) {
        toast.error("Löschen fehlgeschlagen", {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Paperclip className="h-4 w-4" /> Dateien
            <InfoHint text="Dokumente, Pläne, Fotos zum Projekt. Drag & Drop oder Klick zum Hochladen." />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {canWrite && (
            <div
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // Nur abbrechen wenn wir das Drop-Ziel verlassen, nicht ein Kind
                if (e.currentTarget === e.target) setDragActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  void handleFiles(e.dataTransfer.files);
                }
              }}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-8 text-center cursor-pointer transition-colors",
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/40 hover:bg-muted/30",
                uploading && "pointer-events-none opacity-60"
              )}
            >
              {uploading ? (
                <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
              ) : (
                <UploadCloud className="h-8 w-8 text-muted-foreground" />
              )}
              <div className="text-sm font-medium">
                {uploading
                  ? "Wird hochgeladen…"
                  : dragActive
                    ? "Datei hier ablegen"
                    : "Dateien hierher ziehen oder klicken"}
              </div>
              <div className="text-xs text-muted-foreground">
                Maximal 50 MB pro Datei
              </div>
              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    void handleFiles(e.target.files);
                  }
                }}
              />
            </div>
          )}

          {files.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Noch keine Dateien hochgeladen.
            </p>
          ) : (
            <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:h-9 [&_th]:px-3">
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[100px] text-right">Größe</TableHead>
                  <TableHead className="w-[160px]">Hochgeladen</TableHead>
                  <TableHead className="w-[160px]">Von</TableHead>
                  <TableHead className="w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="w-[40px]">
                      <FileTypeIcon mimeType={f.mimeType} name={f.name} />
                    </TableCell>
                    <TableCell className="font-medium">
                      <a
                        href={f.blobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {f.name}
                      </a>
                      <div className="text-[11px] text-muted-foreground">
                        {f.mimeType}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                      {formatBytes(f.sizeBytes)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(new Date(f.uploadedAt))}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[160px]">
                      {f.uploadedBy?.name || f.uploadedBy?.email || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          asChild
                          title="Herunterladen"
                        >
                          <a
                            href={f.blobUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={f.name}
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                        {canWrite && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(f)}
                            disabled={pending}
                            title="Löschen"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {files.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {files.length} {files.length === 1 ? "Datei" : "Dateien"} · gesamt{" "}
              {formatBytes(files.reduce((s, f) => s + f.sizeBytes, 0))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Datei löschen?"
        description={
          deleteTarget && (
            <>
              <strong>{deleteTarget.name}</strong> wird endgültig gelöscht.
              Diese Aktion kann nicht rückgängig gemacht werden.
            </>
          )
        }
        confirmLabel="Löschen"
        pending={pending}
        onConfirm={handleDelete}
      />
    </>
  );
}

function FileTypeIcon({ mimeType, name }: { mimeType: string; name: string }) {
  const lower = (mimeType || "").toLowerCase();
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (lower.startsWith("image/")) {
    return <ImageIcon className="h-4 w-4 text-muted-foreground" />;
  }
  if (lower === "application/pdf" || ext === "pdf") {
    return <FileText className="h-4 w-4 text-muted-foreground" />;
  }
  if (
    lower.includes("zip") ||
    lower.includes("rar") ||
    lower.includes("7z") ||
    ["zip", "rar", "7z", "tar", "gz"].includes(ext)
  ) {
    return <FileArchive className="h-4 w-4 text-muted-foreground" />;
  }
  return <FileIcon className="h-4 w-4 text-muted-foreground" />;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
