/**
 * QR-Code-Payload-Helfer für Geräte und Packeinheiten.
 *
 * Statt einer kompletten URL (z.B. https://.../public/devices/<cuid>) wird
 * im QR-Code nur ein kompakter Token gespeichert:
 *
 *   PU<cuid>  → Packeinheit
 *   DV<cuid>  → Gerät
 *
 * Hintergrund: Eine voll-qualifizierte URL hat ~65 Zeichen und resultiert
 * in einer QR-Code-Version 5 (37×37 Module). Auf einem 1,5 cm gedruckten
 * Sticker bleibt jedes Modul nur 0,4 mm groß — am unteren Rand der Lesbarkeit
 * für eine Phone-Kamera bei 720p.
 *
 * Mit dem kompakten Token (~27 Zeichen) landen wir bei QR-Version 2 (25×25
 * Module), also 0,6 mm pro Modul — 46% größere Module bei gleicher
 * Druckgröße. Das macht das Scannen kleiner Codes auf gewölbten Oberflächen
 * deutlich zuverlässiger.
 *
 * Alte, bereits gedruckte URL-Codes bleiben weiter scanbar — die Scan-Action
 * parst sowohl das neue als auch das alte Format.
 */

export type QrCodeKind = "PU" | "DV";

/** Baut den kompakten QR-Inhalt für eine Packeinheit oder ein Gerät. */
export function buildShortQrPayload(kind: QrCodeKind, id: string): string {
  return `${kind}${id}`;
}

/** Geparste Variante eines QR-Inhalts — entweder unser Kurzcode-Format oder eine URL. */
export interface ParsedQrPayload {
  kind: QrCodeKind | null;
  id: string | null;
  /** Wenn der Code als URL kommt, hier die rohe URL. */
  url: URL | null;
}

const SHORT_CODE_REGEX = /^(PU|DV)([a-z0-9]{8,40})$/i;

/**
 * Versucht einen gescannten Code zu interpretieren. Unterstützt beide Formate:
 *   1) Kurzcode: `PU<cuid>` oder `DV<cuid>`
 *   2) URL: `https://.../public/(pack-units|devices)/<cuid>` (Backward-Compat)
 *
 * Liefert die erkannte Art und die ID, oder leere Felder wenn nichts passt.
 */
export function parseQrPayload(raw: string): ParsedQrPayload {
  const code = (raw ?? "").trim();
  const result: ParsedQrPayload = { kind: null, id: null, url: null };

  // 1) Kurzcode bevorzugt prüfen — billiger und der "neue" Default.
  const shortMatch = code.match(SHORT_CODE_REGEX);
  if (shortMatch) {
    result.kind = shortMatch[1].toUpperCase() as QrCodeKind;
    result.id = shortMatch[2];
    return result;
  }

  // 2) URL-Fallback für Alt-Bestand-Sticker (vor diesem Feature gedruckt).
  try {
    const url = new URL(code);
    result.url = url;
    const pathPack = url.pathname.match(/\/public\/pack-units\/([^/?#]+)/);
    const pathDev = url.pathname.match(/\/public\/devices\/([^/?#]+)/);
    if (pathPack) {
      result.kind = "PU";
      result.id = pathPack[1];
    } else if (pathDev) {
      result.kind = "DV";
      result.id = pathDev[1];
    }
  } catch {
    // kein URL — kein passendes Format, leeres Ergebnis zurück
  }

  return result;
}
