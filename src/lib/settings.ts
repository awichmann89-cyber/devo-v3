import { prisma } from "@/lib/prisma";

export const SETTING_DEFAULTS = {
  invoiceNumberPrefix: "",
  invoiceNumberPadding: "3",
  invoiceNumberNextSequence: "1",
  reminderNumberPrefix: "M",
  reminderNumberPadding: "3",
  reminderNumberNextSequence: "1",
  quoteNumberPrefix: "AN",
  quoteNumberPadding: "3",
  quoteNumberNextSequence: "1",
  // Texte für das Angebots-PDF — können in den Einstellungen angepasst werden.
  // Der Intro-Text steht vor der Positionstabelle, der Outro-Text danach
  // (gefolgt von „Mit freundlichen Grüßen" und der Signatur).
  quoteIntroText:
    "Sehr geehrte Damen und Herren,\n\nherzlichen Dank für Ihr Interesse an einer Zusammenarbeit. Nachfolgend erhalten Sie unser Angebot mit dem angefragten Leistungsumfang.",
  quoteOutroText:
    "Grundlage dieses Angebots sind unsere Allgemeinen Geschäftsbedingungen (AGB). Diese finden Sie unter www.publixound.de. Wir hoffen, ein Angebot in Ihrem Sinne erstellt zu haben und würden uns über eine Auftragserteilung und die damit einhergehende Zusammenarbeit sehr freuen.",
  companyName: "",
  companyStreet: "",
  companyZipCity: "",
  vatPercent: "19",
  dayFactorMap: '{"1":1,"2":1.5,"3":2,"4":2.5,"5":3,"6":3.5,"7":4,"8":4.5,"9":5,"10":5.5}',
  calendarFeedToken: "",
  // Vorgegebene Fristen ab Erstellungs-Datum
  quoteValidityDays: "14",
  invoiceDueDays: "7",
  // Akzentfarbe für Angebots-/Rechnungs-PDFs — wird für Gruppen-Header und
  // den Trennstrich über der Zwischensumme verwendet. Hex-String, z.B.
  // "#1e3a8a". Bei leerem Wert fällt das PDF auf einen neutralen Grauton zurück.
  pdfAccentColor: "#1e3a8a",
} as const;

/**
 * Hex-Farbe ("#RRGGBB" oder "#RGB") in eine [r,g,b]-Tupel für jsPDF parsen.
 * Bei ungültiger Eingabe wird ein neutraler Grauton zurückgegeben, damit das
 * PDF nicht crashed.
 */
export function parseHexColor(hex: string | null | undefined): [number, number, number] {
  const fallback: [number, number, number] = [60, 60, 60];
  if (!hex) return fallback;
  const cleaned = hex.trim().replace(/^#/, "");
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    if ([r, g, b].some(Number.isNaN)) return fallback;
    return [r, g, b];
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    if ([r, g, b].some(Number.isNaN)) return fallback;
    return [r, g, b];
  }
  return fallback;
}

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSetting(key: SettingKey): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? SETTING_DEFAULTS[key];
}

export async function getSettings(): Promise<Record<SettingKey, string>> {
  const keys = Object.keys(SETTING_DEFAULTS) as SettingKey[];
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const result = { ...SETTING_DEFAULTS } as Record<SettingKey, string>;
  for (const r of rows) {
    if (r.key in SETTING_DEFAULTS) {
      result[r.key as SettingKey] = r.value;
    }
  }
  return result;
}

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

/**
 * Nach Löschen einer Rechnung den `invoiceNumberNextSequence`-Wert in den
 * Einstellungen neu setzen, sodass die nächste Rechnung wieder die nun freie
 * Nummer bekommt. Wirkt nur wenn die gelöschte die höchste war — niedrigere
 * Nummern hinterlassen Lücken in der Mitte, da darf der Counter nicht zurück.
 *
 * Pflichtanforderung: Rechnungsnummern müssen pro Jahr fortlaufend ohne
 * Lücken vergeben werden.
 */
export async function recomputeInvoiceNextSequence(): Promise<void> {
  const year = new Date().getFullYear();
  const rows = await prisma.invoice.findMany({
    where: { kind: "INVOICE", number: { startsWith: `${year}-` } },
    select: { number: true },
  });
  let maxSeq = 0;
  for (const r of rows) {
    const m = r.number.match(/-(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n > maxSeq) maxSeq = n;
    }
  }
  await setSetting("invoiceNumberNextSequence" as SettingKey, String(maxSeq + 1));
}

/** Analog zu recomputeInvoiceNextSequence, für den Mahnungs-Nummernkreis. */
export async function recomputeReminderNextSequence(): Promise<void> {
  const year = new Date().getFullYear();
  const rows = await prisma.invoice.findMany({
    where: { kind: "REMINDER", number: { startsWith: `${year}-` } },
    select: { number: true },
  });
  let maxSeq = 0;
  for (const r of rows) {
    const m = r.number.match(/-(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n > maxSeq) maxSeq = n;
    }
  }
  await setSetting("reminderNumberNextSequence" as SettingKey, String(maxSeq + 1));
}

/** Analog zu recomputeInvoiceNextSequence, für den Angebotsnummern-Kreis. */
export async function recomputeQuoteNextSequence(): Promise<void> {
  const year = new Date().getFullYear();
  const rows = await prisma.quote.findMany({
    where: { number: { startsWith: `${year}-` } },
    select: { number: true },
  });
  let maxSeq = 0;
  for (const r of rows) {
    const m = r.number.match(/-(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n > maxSeq) maxSeq = n;
    }
  }
  await setSetting("quoteNumberNextSequence" as SettingKey, String(maxSeq + 1));
}

/** Liefert den Kalender-Token, erzeugt einen, falls noch keiner gespeichert ist. */
export async function getOrCreateCalendarToken(): Promise<string> {
  const existing = await getSetting("calendarFeedToken");
  if (existing) return existing;
  const fresh = crypto.randomUUID().replace(/-/g, "");
  await setSetting("calendarFeedToken", fresh);
  return fresh;
}

/**
 * Baut eine Rechnungsnummer im Format `YYYY-[PREFIX-]NNN` zusammen.
 */
export function buildInvoiceNumber(
  year: number,
  sequence: number,
  prefix: string,
  padding: number
): string {
  const num = String(sequence).padStart(Math.max(1, padding), "0");
  return prefix ? `${year}-${prefix}-${num}` : `${year}-${num}`;
}

export function buildQuoteNumber(
  year: number,
  sequence: number,
  prefix: string,
  padding: number
): string {
  const num = String(sequence).padStart(Math.max(1, padding), "0");
  return prefix ? `${year}-${prefix}-${num}` : `${year}-${num}`;
}

export function buildReminderNumber(
  year: number,
  sequence: number,
  prefix: string,
  padding: number
): string {
  const num = String(sequence).padStart(Math.max(1, padding), "0");
  return prefix ? `${year}-${prefix}-${num}` : `${year}-${num}`;
}

export type DayFactorMap = Record<number, number>;

const FALLBACK_FACTORS: DayFactorMap = {
  1: 1, 2: 1.5, 3: 2, 4: 2.5, 5: 3, 6: 3.5, 7: 4, 8: 4.5, 9: 5, 10: 5.5,
};

/** Parsed Faktoren aus dem Settings-JSON; defekte/fehlende Schlüssel werden mit Fallback-Werten ergänzt. */
export function parseDayFactorMap(json: string): DayFactorMap {
  const map: DayFactorMap = { ...FALLBACK_FACTORS };
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    for (const k of Object.keys(parsed)) {
      const day = Number(k);
      const factor = Number(parsed[k]);
      if (
        Number.isInteger(day) &&
        day >= 1 &&
        day <= 10 &&
        isFinite(factor) &&
        factor >= 0
      ) {
        map[day] = factor;
      }
    }
  } catch {
    // ignore, return fallback
  }
  return map;
}

/**
 * Liefert den Mietfaktor für eine Anzahl Tage.
 * Mapping 1-10 aus Settings; für Tage > 10 wird linear fortgesetzt: Faktor[10] + (Tage - 10).
 */
export function getDayFactor(days: number, map: DayFactorMap): number {
  if (days <= 0) return 0;
  if (days >= 1 && days <= 10) return map[days] ?? days;
  return (map[10] ?? 5.5) + (days - 10);
}
