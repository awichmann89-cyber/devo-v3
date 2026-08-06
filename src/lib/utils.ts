import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const APP_TZ = "Europe/Berlin";

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: APP_TZ,
  });
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TZ,
  });
}

export function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(num);
}

/**
 * Betrag mit typografischem Minus (U+2212) statt ASCII-Hyphen.
 *
 * Für Abzüge (Rabatte, Kosten), die als negativer Posten dargestellt werden,
 * auch wenn der Wert positiv übergeben wird: `formatCurrencySigned(50, {negate: true})`
 * → „−50,00 €". Bei 0 kommt der Platzhalter „—".
 */
export function formatCurrencySigned(
  value: number | null | undefined,
  options: { negate?: boolean; zeroAsDash?: boolean } = {}
): string {
  const { negate = false, zeroAsDash = true } = options;
  if (value === null || value === undefined) return "—";
  if (value === 0 && zeroAsDash) return "—";
  const abs = Math.abs(value);
  const isNegative = negate ? value > 0 : value < 0;
  return (isNegative ? "−" : "") + formatCurrency(abs);
}

export function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

/**
 * Baut einen einheitlichen PDF-Dateinamen im Format
 *   YYYY-DD-MM <Typ> <Kunde> - <Projekt>.pdf
 */
export function buildProjectPdfFilename(
  type: string,
  customerName: string | null | undefined,
  projectName: string
): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const datePrefix = `${yyyy}-${dd}-${mm}`;
  const customer = customerName?.trim();
  const base = customer
    ? `${datePrefix} ${type} ${customer} - ${projectName}`
    : `${datePrefix} ${type} ${projectName}`;
  const safe = base.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  return `${safe}.pdf`;
}

/**
 * Baut den Dateinamen für ein Rechnungs- oder Angebots-PDF im Format
 *   <FORTLAUFENDE_NUMMER> <Typ> <GESAMTE_NUMMER> <Kunde> - <Projekt>.pdf
 */
export function buildDocumentPdfFilename(
  type: string,
  fullNumber: string,
  customerName: string | null | undefined,
  projectName: string
): string {
  const m = fullNumber.match(/-(\d+)$/);
  const sequence = m ? m[1] : fullNumber;
  const customer = customerName?.trim();
  const base = customer
    ? `${sequence} ${type} ${fullNumber} ${customer} - ${projectName}`
    : `${sequence} ${type} ${fullNumber} ${projectName}`;
  const safe = base.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  return `${safe}.pdf`;
}

// ---------- Adress-Helpers ----------

/**
 * Zerlegt eine im DB-Feld `address` gespeicherte Adresse in zwei Zeilen:
 *   1. Straße + Hausnummer
 *   2. PLZ + Ort
 */
export function splitAddress(addr: string | null | undefined): {
  street: string;
  zipCity: string;
} {
  if (!addr) return { street: "", zipCity: "" };
  const lines = addr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    street: lines[0] ?? "",
    zipCity: lines.slice(1).join(", ").trim(),
  };
}

/**
 * Setzt zwei Adress-Zeilen wieder zusammen zur DB-Repräsentation.
 * Leere Eingaben werden zu null, damit das optionale DB-Feld sauber bleibt.
 */
export function joinAddress(
  street: string,
  zipCity: string
): string | null {
  const s = street.trim();
  const z = zipCity.trim();
  if (!s && !z) return null;
  return [s, z].filter(Boolean).join("\n");
}

// ---------- Prisma Decimal Serialisierung ----------

type Decimallish = {
  toNumber: () => number;
  toFixed: (n?: number) => string;
  toString: () => string;
};

function isDecimal(v: unknown): v is Decimallish {
  return (
    v !== null &&
    typeof v === "object" &&
    typeof (v as { toNumber?: unknown }).toNumber === "function" &&
    typeof (v as { toFixed?: unknown }).toFixed === "function"
  );
}

/**
 * Wandelt Prisma Decimal-Objekte rekursiv in plain numbers um.
 */
export function serialize<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj;
  if (isDecimal(obj)) return obj.toNumber() as unknown as T;
  if (Array.isArray(obj)) return obj.map((item) => serialize(item)) as unknown as T;
  if (obj instanceof Map) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of obj) out[String(k)] = serialize(v);
    return out as unknown as T;
  }
  if (obj instanceof Set) {
    return Array.from(obj).map((item) => serialize(item)) as unknown as T;
  }
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const key in obj as object) {
      out[key] = serialize((obj as Record<string, unknown>)[key]);
    }
    return out as T;
  }
  return obj;
}
