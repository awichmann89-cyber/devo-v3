"use client";

import { useRef, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import { Button } from "@/components/ui/button";
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
import { put } from "@vercel/blob/client";
import {
  createProjectFileUploadToken,
  registerProjectFile,
  deleteProjectFile,
  discardOrphanedUpload,
} from "./files-actions";
import {
  MAX_UPLOAD_BYTES,
  MULTIPART_THRESHOLD_BYTES,
} from "@/lib/project-files";
import { cn, formatDate } from "@/lib/utils";
import { toastError } from "@/lib/toast";

const MAX_MB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);

type Progress = {
  name: string;
  percentage: number;
  index: number;
  total: number;
};

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
  const [progress, setProgress] = useState<Progress | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileVM | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadOne(file: File, index: number, total: number) {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`Datei ist größer als ${MAX_MB} MB`, {
        description: file.name,
      });
      return;
    }
    setProgress({ name: file.name, percentage: 0, index, total });

    // Der Blob liegt nach dem Upload im Store, sichtbar wird er aber erst mit
    // dem DB-Eintrag. Scheitert Schritt 2, muss er wieder weg.
    let orphanUrl: string | null = null;
    try {
      const { clientToken, pathname, contentType } =
        await createProjectFileUploadToken(projectId, {
          name: file.name,
          size: file.size,
          contentType: file.type,
        });

      // Direkt in den Blob-Store, nicht über eine Server-Action: Vercel
      // begrenzt den Body einer Function hart auf 4,5 MB.
      const blob = await put(pathname, file, {
        access: "public",
        token: clientToken,
        contentType,
        multipart: file.size > MULTIPART_THRESHOLD_BYTES,
        onUploadProgress: ({ percentage }) =>
          setProgress({ name: file.name, percentage, index, total }),
      });
      orphanUrl = blob.url;

      await registerProjectFile(projectId, {
        url: blob.url,
        pathname: blob.pathname,
        name: file.name,
      });
      orphanUrl = null;
      toast.success("Datei hochgeladen", { description: file.name });
    } catch (e) {
      if (orphanUrl) {
        try {
          await discardOrphanedUpload(orphanUrl);
        } catch {
          // Aufräumen ist best effort — der eigentliche Fehler zählt.
        }
      }
      toastError(e, "Hochladen");
    }
  }

  async function handleFiles(list: FileList | File[]) {
    const arr = Array.from(list);
    if (arr.length === 0) return;
    setUploading(true);
    try {
      // Sequentiell, damit Toasts und Reihenfolge gewahrt bleiben
      for (let i = 0; i < arr.length; i++) {
        await uploadOne(arr[i], i, arr.length);
      }
    } finally {
      setUploading(false);
      setProgress(null);
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
        toastError(e, "Löschen");
      }
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
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
                  ? progress
                    ? `Wird hochgeladen… ${Math.round(progress.percentage)} %`
                    : "Wird hochgeladen…"
                  : dragActive
                    ? "Datei hier ablegen"
                    : "Dateien hierher ziehen oder klicken"}
              </div>
              <div className="text-xs text-muted-foreground">
                {uploading && progress
                  ? progress.total > 1
                    ? `${progress.name} (${progress.index + 1}/${progress.total})`
                    : progress.name
                  : `Maximal ${MAX_MB} MB pro Datei`}
              </div>
              {uploading && progress && (
                <div className="h-1 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.round(progress.percentage)}%` }}
                  />
                </div>
              )}
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
            <Table density="comfortable">
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
                    <TableCell className="num text-right text-xs text-muted-foreground">
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
                          size="iconXs"
                          
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
                            size="iconXs"
                            className="text-destructive hover:text-destructive"
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
