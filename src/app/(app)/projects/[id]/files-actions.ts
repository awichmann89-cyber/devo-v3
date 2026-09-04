"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { del, head } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import {
  MAX_UPLOAD_BYTES,
  blobPathPrefix,
  safeBlobName,
} from "@/lib/project-files";

const MAX_MB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);

/**
 * Schritt 1 des Uploads: signiertes Token für einen Direkt-Upload des Browsers
 * in den Blob-Store.
 *
 * Warum nicht einfach die Datei per Server-Action schicken? Vercel begrenzt den
 * Request-Body einer Function hart auf 4,5 MB — unabhängig von
 * `serverActions.bodySizeLimit`. Größere Dateien beantwortet die Plattform mit
 * 413, und weil das keine gültige Server-Action-Antwort ist, sieht der Nutzer
 * nur noch „An unexpected response was received from the server". Der Browser
 * lädt deshalb direkt zum Blob-Store; die Datei läuft nie über unsere Function.
 */
export async function createProjectFileUploadToken(
  projectId: string,
  file: { name: string; size: number; contentType: string }
) {
  await requireRole(CAN_WRITE);

  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new Error("Datei ist leer");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Datei ist größer als ${MAX_MB} MB`);
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) throw new Error("Projekt nicht gefunden");

  const contentType = file.contentType || "application/octet-stream";
  const pathname = `${blobPathPrefix(projectId)}${safeBlobName(file.name)}`;

  // Das Token trägt Pfad, Größenlimit und Content-Type signiert mit — der
  // Browser kann damit ausschließlich diese eine Datei in dieses Projekt legen.
  // Ohne `validUntil` wäre es nur 30 Sekunden gültig, das reicht für 50 MB an
  // einer schlechten Leitung nicht; bei Multipart wird es je Teil erneut
  // geprüft und muss über den ganzen Upload gültig bleiben.
  const clientToken = await generateClientTokenFromReadWriteToken({
    pathname,
    addRandomSuffix: true,
    maximumSizeInBytes: MAX_UPLOAD_BYTES,
    allowedContentTypes: [contentType],
    validUntil: Date.now() + 60 * 60 * 1000,
  });

  return { clientToken, pathname, contentType };
}

/**
 * Schritt 2 des Uploads: den fertigen Blob in der DB verbuchen.
 *
 * Größe und Content-Type werden bewusst nicht vom Client übernommen, sondern
 * per `head()` aus dem Store gelesen.
 */
export async function registerProjectFile(
  projectId: string,
  blob: { url: string; pathname: string; name: string }
) {
  const session = await requireRole(CAN_WRITE);

  if (!blob.pathname.startsWith(blobPathPrefix(projectId))) {
    throw new Error("Upload gehört nicht zu diesem Projekt");
  }

  let meta;
  try {
    meta = await head(blob.url);
  } catch {
    throw new Error("Upload im Speicher nicht gefunden");
  }
  if (meta.pathname !== blob.pathname) {
    throw new Error("Upload gehört nicht zu diesem Projekt");
  }
  if (meta.size > MAX_UPLOAD_BYTES) {
    await del(blob.url).catch(() => null);
    throw new Error(`Datei ist größer als ${MAX_MB} MB`);
  }

  const name =
    blob.name.trim().slice(0, 255) || meta.pathname.split("/").pop() || "Datei";

  await prisma.projectFile.create({
    data: {
      projectId,
      name,
      mimeType: meta.contentType || "application/octet-stream",
      sizeBytes: meta.size,
      blobUrl: meta.url,
      blobPathname: meta.pathname,
      uploadedById: session.user.id,
    },
    select: { id: true },
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function deleteProjectFile(fileId: string) {
  await requireRole(CAN_WRITE);

  const file = await prisma.projectFile.findUnique({
    where: { id: fileId },
    select: { projectId: true, blobUrl: true },
  });
  if (!file) throw new Error("Datei nicht gefunden");

  // Erst aus Blob löschen — wenn das fehlschlägt, bleibt der DB-Eintrag
  // erhalten und wir können später nochmal versuchen. Andersrum hätten wir
  // verwaiste Blob-Objekte.
  try {
    await del(file.blobUrl);
  } catch (e) {
    // Wenn das Blob schon weg ist (z.B. manuell gelöscht), nicht hart fehlen
    console.error("Blob-Delete fehlgeschlagen:", e);
  }

  await prisma.projectFile.delete({ where: { id: fileId } });

  revalidatePath(`/projects/${file.projectId}`);
}

/**
 * Räumt einen Blob auf, dessen DB-Eintrag nicht zustande kam (z.B. weil der
 * Nutzer die Rechte verloren hat). Ohne das bliebe Datenmüll im Store liegen.
 */
export async function discardOrphanedUpload(url: string) {
  await requireRole(CAN_WRITE);
  await del(url).catch(() => null);
}
