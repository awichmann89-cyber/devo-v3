/**
 * QR-Code-Payload-Helfer für Geräte und Packeinheiten.
 *
 * Der QR-Code muss eine echte URL sein, damit man ihn auch mit der iOS-Kamera
 * öffnen kann und auf einer sinnvollen Seite landet. Gleichzeitig wollen wir
 * möglichst wenig Zeichen im QR — je kürzer, desto weniger QR-Module, desto
 * besser scanbar bei kleiner Druckgröße.
 *
 * Optimierungs-Strategie (gegen die Anfangs-Version):
 *   alt:    https://<domain>/public/(devices|pack-units)/<25-Zeichen-cuid>  ≈ 65 Zeichen → QR V5 (37×37)
 *   neu:    https://<domain>/q/<8-Zeichen-shortId>                          ≈ 29 Zeichen → QR V2 (25×25)
 *
 * Die `shortId` ist ein 8-Zeichen Uppercase-Token, gespeichert auf Device
 * und PackUnit als eigenes Feld mit Unique-Constraint. Im Default kommt es
 * aus den letzten 8 Zeichen der cuid (mit upper()), kann aber auch
 * unabhängig gesetzt werden. Geteilter Namespace zwischen beiden Tabellen.
 *
 * Beim Scannen erkennen wir mehrere Formate, damit alte gedruckte Sticker
 * weiter funktionieren.
 */

/**
 * Baut den QR-Inhalt als URL — neues Kurz-Schema mit shortId.
 *
 *   https://<domain>/q/<8-Zeichen-shortId>
 *
 * Beispiel: https://cratel.app/q/CLZ3A8X4
 */
export function buildQrUrl(origin: string, shortId: string): string {
  const cleanOrigin = origin.replace(/\/+$/, "");
  return `${cleanOrigin}/q/${shortId.toUpperCase()}`;
}

/**
 * Erzeugt eine neue zufällige shortId (8 Zeichen, A-Z + 0-9 = 36 Zeichen Alphabet).
 * 36^8 ≈ 2,8 Billionen Permutationen — Kollisionen sind bei realistischen
 * Bestandsgrößen praktisch ausgeschlossen, der Unique-Constraint auf der
 * DB fängt theoretische Edge-Cases trotzdem ab.
 */
export function generateShortId(length = 8): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  // Web Crypto ist in Node ab v15 ohne Import verfügbar (globalThis.crypto).
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let id = "";
  for (let i = 0; i < length; i++) {
    id += alphabet[bytes[i] % alphabet.length];
  }
  return id;
}

/**
 * Ergebnis einer Code-Analyse. `shortId` (neu) und `cuid` (alt, legacy) sind
 * alternative Identifier — der Caller muss in der jeweils passenden DB-Spalte
 * suchen. Falls weder noch matched, sind beide null.
 */
export interface ParsedQrPayload {
  /** Neuer Kurz-Token (8 Zeichen uppercase), z.B. "CLZ3A8X4". */
  shortId: string | null;
  /** Alte volle cuid (~25 Zeichen lowercase), wenn ein Legacy-URL gescannt wurde. */
  cuid: string | null;
  /** Bei Legacy-URLs: erkannte Art (PU oder DV). Bei shortId nicht relevant (Lookup geht in beide Tabellen). */
  legacyKind: "PU" | "DV" | null;
  /** Roh-Parse der URL, falls vorhanden. */
  url: URL | null;
}

const SHORT_ID_REGEX = /^[A-Za-z0-9]{6,12}$/;

/**
 * Versucht einen gescannten Code zu interpretieren. Unterstützt:
 *
 *   1) Neues Kurz-URL-Format:     https://.../q/<SHORTID>
 *   2) Legacy-Kurzcode-URL (P1):  https://.../q/(PU|DV)<cuid>          (interim Format)
 *   3) Legacy URL-Format:         https://.../public/(devices|pack-units)/<cuid>
 *   4) Plain-Token:               <SHORTID>  oder  PU<cuid> / DV<cuid>
 */
export function parseQrPayload(raw: string): ParsedQrPayload {
  const code = (raw ?? "").trim();
  const result: ParsedQrPayload = {
    shortId: null,
    cuid: null,
    legacyKind: null,
    url: null,
  };

  // ---- URL-Pfad zuerst probieren ----
  try {
    const url = new URL(code);
    result.url = url;

    // 1) Neues Kurz-Schema /q/<SHORTID>
    //    SHORTID ist 6-12 alphanumerische Zeichen, keine Prefix-Buchstaben PU/DV.
    const pathShort = url.pathname.match(/\/q\/([A-Za-z0-9]{6,12})$/);
    if (pathShort && !/^(PU|DV)/i.test(pathShort[1])) {
      result.shortId = pathShort[1].toUpperCase();
      return result;
    }

    // 2) Legacy interim format /q/(PU|DV)<cuid> (vor dem shortId-Refactor gedruckt)
    const pathLegacyPrefix = url.pathname.match(/\/q\/(PU|DV)([a-z0-9]{20,40})$/i);
    if (pathLegacyPrefix) {
      result.legacyKind = pathLegacyPrefix[1].toUpperCase() as "PU" | "DV";
      result.cuid = pathLegacyPrefix[2];
      return result;
    }

    // 3) Älteres Legacy-Schema /public/(devices|pack-units)/<cuid>
    const pathPack = url.pathname.match(/\/public\/pack-units\/([^/?#]+)/);
    const pathDev = url.pathname.match(/\/public\/devices\/([^/?#]+)/);
    if (pathPack) {
      result.legacyKind = "PU";
      result.cuid = pathPack[1];
      return result;
    }
    if (pathDev) {
      result.legacyKind = "DV";
      result.cuid = pathDev[1];
      return result;
    }
  } catch {
    // kein URL — weiter mit Plain-Token-Check
  }

  // ---- Plain-Token-Fallback ----
  // 4a) Legacy Plain-Token PU<cuid> / DV<cuid>
  const legacyPlain = code.match(/^(PU|DV)([a-z0-9]{20,40})$/i);
  if (legacyPlain) {
    result.legacyKind = legacyPlain[1].toUpperCase() as "PU" | "DV";
    result.cuid = legacyPlain[2];
    return result;
  }

  // 4b) Plain shortId (eingetippt aus der Caption unter dem QR-Code)
  if (SHORT_ID_REGEX.test(code) && !/^(PU|DV)/i.test(code)) {
    result.shortId = code.toUpperCase();
    return result;
  }

  return result;
}
