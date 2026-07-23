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
