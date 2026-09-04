/**
 * Gemeinsame Regeln für Projekt-Datei-Uploads.
 *
 * Liegt bewusst hier und nicht in `files-actions.ts`: Aus einem
 * `"use server"`-Modul dürfen nur async Funktionen exportiert werden, Client
 * und Server brauchen die Werte aber beide.
 */

/** Harte Obergrenze pro Datei. Wird im Client-Token mitsigniert. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Ab dieser Größe wird in mehreren Teilen parallel hochgeladen (mit Retry pro
 * Teil). Darunter kostet Multipart nur zusätzliche Requests.
 */
export const MULTIPART_THRESHOLD_BYTES = 5 * 1024 * 1024;

/** Alle Dateien eines Projekts liegen unter diesem Prefix im Blob-Store. */
export function blobPathPrefix(projectId: string): string {
  return `projects/${projectId}/`;
}

/**
 * Dateiname für den Blob-Pfad. Umlaute, Leerzeichen und Sonderzeichen werden
 * ersetzt — der Original-Name wird separat in der DB gespeichert und in der UI
 * angezeigt.
 */
export function safeBlobName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  return cleaned.replace(/^[._]+/, "") || "datei";
}
