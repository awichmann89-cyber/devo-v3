"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { put, del } from "@vercel/blob";

/**
 * Lädt eine Datei zu einem Projekt hoch.
 *
 * Achtung: Server-Actions in Next.js haben standardmäßig ein Body-Limit von
 * ~1 MB. Für größere Dateien siehe `serverActions.bodySizeLimit` in
 * next.config.ts oder den Wechsel auf eine API-Route mit Streaming.
 */
export async function uploadProjectFile(projectId: string, formData: FormData) {
  const session = await requireRole(CAN_WRITE);

  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("Keine Datei übermittelt");
  }
  if (file.size === 0) {
    throw new Error("Datei ist leer");
  }

  // Projekt prüfen — wirft 404 wenn nicht existent
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) throw new Error("Projekt nicht gefunden");

  // Eindeutiger Pfad: projects/<projectId>/<random>-<filename>
  // Vercel Blob hängt automatisch einen Zufalls-Suffix an — wir geben
  // hier den Wunsch-Pathname an, der Resultat-Pathname kommt aus der Response.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathname = `projects/${projectId}/${safeName}`;

  const blob = await put(pathname, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type || "application/octet-stream",
  });

  await prisma.projectFile.create({
    data: {
      projectId,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      blobUrl: blob.url,
      blobPathname: blob.pathname,
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
