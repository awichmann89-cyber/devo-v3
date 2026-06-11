import fs from "node:fs";
import path from "node:path";
import type { jsPDF } from "jspdf";

/**
 * Registriert die Inter-Schriftart (Regular + Bold) in einem jsPDF-Doc und
 * setzt sie als aktive Schrift. Aufrufen direkt nach `new jsPDF(...)`.
 *
 * Die TTF-Dateien kommen aus dem `@fontsource/inter` Paket — beim Vercel-Build
 * müssen die Dateien über `outputFileTracingIncludes` in `next.config.ts` mit
 * ins Server-Bundle aufgenommen werden.
 */
export function setupInterFont(doc: jsPDF): void {
  const fontsDir = path.join(
    process.cwd(),
    "node_modules",
    "@fontsource",
    "inter",
    "files"
  );

  try {
    const regular = fs.readFileSync(
      path.join(fontsDir, "inter-latin-400-normal.ttf")
    );
    const bold = fs.readFileSync(
      path.join(fontsDir, "inter-latin-700-normal.ttf")
    );
    // jsPDF braucht base64-Strings im VFS
    doc.addFileToVFS("Inter-Regular.ttf", regular.toString("base64"));
    doc.addFileToVFS("Inter-Bold.ttf", bold.toString("base64"));
    doc.addFont("Inter-Regular.ttf", "Inter", "normal");
    doc.addFont("Inter-Bold.ttf", "Inter", "bold");
    doc.setFont("Inter", "normal");
  } catch (e) {
    // Falls die TTF-Dateien aus irgendeinem Grund nicht gefunden werden,
    // bleibt der Default-Font Helvetica — das PDF rendert dann zwar etwas
    // klassischer, aber es schmiert nicht ab.
    console.error("Inter-Font konnte nicht geladen werden:", e);
  }
}
