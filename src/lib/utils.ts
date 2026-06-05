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

export function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

/**
 * Baut einen einheitlichen PDF-Dateinamen im Format
 *   YYYY-DD-MM <Typ> <Kunde> - <Projekt>.pdf
 * Ist kein Kunde gesetzt, fällt der „Kunde - "-Teil weg.
 * Datei-systemkritische Zeichen (\ / : * ? " < > |) werden entfernt.
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
 *
 * Beispiel: invoiceNumber „2026-PA-001", Typ „Rechnung"
 *   → „001 Rechnung 2026-PA-001 DJK e.V. - Bundessportfest.pdf".
 * Die fortlaufende Nummer wird aus dem Trailer der Gesamtnummer extrahiert
 * (alles nach dem letzten Bindestrich, das aus Ziffern besteht). Ist das nicht
 * der Fall, wird die Gesamtnummer auch als fortlaufende Nummer verwendet.
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
 *
 * Bestehende Adressen wurden teilweise mehrzeilig gespeichert. Falls die
 * Adresse mehr als zwei Zeilen hat, werden Zeilen 2+ als "PLZ Ort" zusammen-
 * gefasst (damit nichts verloren geht).
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
    typeof (v as { toNumber?: unknown }).toNumber 