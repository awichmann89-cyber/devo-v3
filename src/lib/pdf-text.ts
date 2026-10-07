import type { jsPDF } from "jspdf";

/**
 * Zeichnet eine „Label: Wert"-Zeile mit automatischem Umbruch, wenn der Wert
 * breiter als maxWidth ist (z.B. lange Projektnamen auf Angeboten und
 * Rechnungen). Folgezeilen werden um die Label-Breite eingerückt, sodass der
 * Wert bündig untereinander steht:
 *
 *   Projekt: Technische Betreuung Ausschuss Chancengerechtigkeit und
 *            Integration / Bestellung Nr. 450277976 (Full-Service)
 *
 * Nutzt die aktuell am Dokument gesetzte Schrift/-größe. Gibt die Y-Position
 * der zuletzt gezeichneten Zeile zurück.
 */
export function drawLabeledWrappedText(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight = 5,
): number {
  const labelWidth = doc.getTextWidth(label);
  const lines = doc.splitTextToSize(
    value,
    Math.max(20, maxWidth - labelWidth),
  ) as string[];
  doc.text(label + (lines[0] ?? ""), x, y);
  for (let i = 1; i < lines.length; i++) {
    y += lineHeight;
    doc.text(lines[i], x + labelWidth, y);
  }
  return y;
}

/**
 * Die jsPDF-Standardfonts (Helvetica & Co.) können nur WinAnsi/Latin-1.
 * Zeichen außerhalb davon — z.B. der Pfeil „→" aus der Kabel-Beschreibung —
 * rendert jsPDF nicht nur falsch, es zerreißt auch die Buchstabenabstände
 * der ganzen Zeile. Deshalb läuft JEDER Text vor der Ausgabe hier durch.
 */
export function pdfText(value: string): string {
  return (
    value
      .replace(/[→⇒➔]/g, "->")
      .replace(/[←⇐]/g, "<-")
      .replace(/[✓✔]/g, "x")
      .replace(/[•·]/g, "·") // Bullet → WinAnsi-Mittelpunkt
      // Was WinAnsi dann noch immer nicht kann, ersetzen wir sichtbar,
      // statt es die Zeile zerschießen zu lassen. Erlaubt sind Latin-1
      // plus die WinAnsi-Extras (Anführungszeichen, Gedankenstriche, …, €).
      .replace(/[^\n\x20-\xFF–—‘’‚“”„…€]/g, "?")
  );
}

/** Eine autoTable-Zelle: reiner Text oder {content} mit Styles. */
export type PdfCell =
  | string
  | { content: string; colSpan?: number; styles?: Record<string, unknown> };

/** Wendet pdfText auf eine autoTable-Zelle an (String oder {content}). */
export function sanitizeCell(cell: PdfCell): PdfCell {
  if (typeof cell === "string") return pdfText(cell);
  return { ...cell, content: pdfText(cell.content) };
}
