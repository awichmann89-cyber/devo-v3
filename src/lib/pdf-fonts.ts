import fs from "node:fs";
import path from "node:path";
import type { jsPDF } from "jspdf";

/**
 * Registriert die Geist-Sans-Schriftart (Regular + Bold) in einem jsPDF-Doc
 * und setzt sie als aktive Schrift. Aufrufen direkt nach `new jsPDF(...)`.
 *
 * Wichtig: jsPDF benötigt TTF-Dateien — die üblichen `@fontsource/*`-Pakete
 * liefern nur WOFF/WOFF2 und funktionieren daher NICHT. Deshalb nutzen wir
 * das offizielle `geist`-npm-Paket von Vercel, das unter
 * `dist/fonts/geist-sans/*.ttf` echte TTF-Dateien mitbringt.
 *
 * Beim Vercel-Build müssen die TTFs über `outputFileTracingIncludes` in
 * `next.config.ts` mit ins Server-Bundle aufgenommen werden — sonst kann
 * fs.readFileSync sie zur Laufzeit nicht finden.
 *
 * Regular (400) + Bold (700) werden geladen, damit `setFont(undefined,
 * "bold")` einen echten Bold-Schnitt bekommt statt eines synthetisch
 * verbreiterten Regulars.
 */
export function setupGeistFont(doc: jsPDF): void {
  const fontsDir = path.join(
    process.cwd(),
    "node_modules",
    "geist",
    "dist",
    "fonts",
    "geist-sans"
  );

  try {
    const regular = fs.readFileSync(
      path.join(fontsDir, "Geist-Regular.ttf")
    );
    const bold = fs.readFileSync(path.join(fontsDir, "Geist-Bold.ttf"));
    // jsPDF braucht base64-Strings im VFS
    doc.addFileToVFS("Geist-Regular.ttf", regular.toString("base64"));
    doc.addFileToVFS("Geist-Bold.ttf", bold.toString("base64"));
    doc.addFont("Geist-Regular.ttf", "Geist", "normal");
    doc.addFont("Geist-Bold.ttf", "Geist", "bold");
    doc.setFont("Geist", "normal");
  } catch (e) {
    // Falls die TTF-Dateien aus irgendeinem Grund nicht gefunden werden,
    // bleibt der Default-Font Helvetica — das PDF rendert dann zwar etwas
    // klassischer, aber es schmiert nicht ab.
    console.error("Geist-Font konnte nicht geladen werden:", e);
  }
}

/**
 * Kompatibilitäts-Alias: einige Aufrufer heißen historisch `setupInterFont`.
 * Der eigentliche Font ist inzwischen Geist — der Name wird beibehalten,
 * damit bestehende Imports weiterlaufen. In neuem Code bitte `setupGeistFont`
 * verwenden.
 */
export const setupInterFont = setupGeistFont;
