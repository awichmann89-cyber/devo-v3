import { prisma } from "@/lib/prisma";

export const SETTING_DEFAULTS = {
  invoiceNumberPrefix: "",
  invoiceNumberPadding: "3",
  invoiceNumberNextSequence: "1",
  quoteNumberPrefix: "AN",
  quoteNumberPadding: "3",
  quoteNumberNextSequence: "1",
  companyName: "",
  companyStreet: "",
  companyZipCity: "",
  vatPercent: "19",
  dayFactorMap: '{"1":1,"2":1.5,"3":2,"4":2.5,"5":3,"6":3.5,"7":4,"8":4.5,"9":5,"10":5.5}',
  calendarFeedToken: "",
} as const;

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
