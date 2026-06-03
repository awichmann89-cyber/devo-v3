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
