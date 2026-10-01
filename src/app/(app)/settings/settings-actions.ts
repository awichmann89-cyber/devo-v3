"use server";

import { revalidatePath } from "next/cache";
import { requireRole, CAN_ADMIN } from "@/lib/auth-helpers";
import { setSetting, SettingKey } from "@/lib/settings";
import {
  COMPANY_FOOTER_TOGGLE_KEY,
  type CompanyFooterDocument,
} from "@/lib/company-footer";

export interface CompanyDataInput {
  name: string;
  street: string;
  zipCity: string;
  vatPercent: number;
  phone: string;
  email: string;
  website: string;
  management: string;
  register: string;
  taxNumber: string;
  vatId: string;
  bankAccountHolder: string;
  bankName: string;
  bankIban: string;
  bankBic: string;
}

export async function saveCompanyData(data: CompanyDataInput) {
  await requireRole(CAN_ADMIN);
  const text = (v: string | undefined, max = 200) => (v ?? "").trim().slice(0, max);
  const iban = (data.bankIban ?? "").replace(/\s+/g, "").toUpperCase().slice(0, 34);
  if (iban && !/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban)) {
    throw new Error("IBAN ungültig — erwartet z.B. DE12 3456 7890 1234 5678 90.");
  }
  const bic = (data.bankBic ?? "").replace(/\s+/g, "").toUpperCase().slice(0, 11);
  const values: Partial<Record<SettingKey, string>> = {
    companyName: text(data.name),
    companyStreet: text(data.street),
    companyZipCity: text(data.zipCity),
    companyPhone: text(data.phone, 50),
    companyEmail: text(data.email),
    companyWebsite: text(data.website),
    companyManagement: text(data.management),
    companyRegister: text(data.register),
    companyTaxNumber: text(data.taxNumber, 50),
    companyVatId: text(data.vatId, 50),
    bankAccountHolder: text(data.bankAccountHolder),
    bankName: text(data.bankName),
    bankIban: iban,
    bankBic: bic,
    vatPercent: String(Math.max(0, Math.min(100, Number(data.vatPercent) || 0))),
  };
  for (const [key, value] of Object.entries(values)) {
    await setSetting(key as SettingKey, value ?? "");
  }
  revalidatePath("/settings");
}

/** Schalter „Firmendaten in der Fußzeile drucken" pro Dokumentart. */
export async function saveCompanyFooterToggle(
  document: CompanyFooterDocument,
  enabled: boolean
) {
  await requireRole(CAN_ADMIN);
  const key = COMPANY_FOOTER_TOGGLE_KEY[document];
  if (!key) throw new Error("Unbekannte Dokumentart");
  await setSetting(key, enabled ? "1" : "0");
  revalidatePath("/settings");
}

export async function saveInvoiceNumberSettings(
  prefix: string,
  padding: number,
  nextSequence: number
) {
  await requireRole(CAN_ADMIN);
  const p = (prefix ?? "").trim().toUpperCase().slice(0, 10);
  if (p && !/^[A-Z0-9-]+$/.test(p)) {
    throw new Error("Prefix darf nur Großbuchstaben, Zahlen und Bindestriche enthalten.");
  }
  const pad = Math.max(1, Math.min(8, Math.floor(padding) || 3));
  const next = Math.max(1, Math.floor(nextSequence) || 1);
  await setSetting("invoiceNumberPrefix" as SettingKey, p);
  await setSetting("invoiceNumberPadding" as SettingKey, String(pad));
  await setSetting("invoiceNumberNextSequence" as SettingKey, String(next));
  revalidatePath("/settings");
}

export async function saveReminderNumberSettings(
  prefix: string,
  padding: number,
  nextSequence: number
) {
  await requireRole(CAN_ADMIN);
  const p = (prefix ?? "").trim().toUpperCase().slice(0, 10);
  if (p && !/^[A-Z0-9-]+$/.test(p)) {
    throw new Error("Prefix darf nur Großbuchstaben, Zahlen und Bindestriche enthalten.");
  }
  const pad = Math.max(1, Math.min(8, Math.floor(padding) || 3));
  const next = Math.max(1, Math.floor(nextSequence) || 1);
  await setSetting("reminderNumberPrefix" as SettingKey, p);
  await setSetting("reminderNumberPadding" as SettingKey, String(pad));
  await setSetting("reminderNumberNextSequence" as SettingKey, String(next));
  revalidatePath("/settings");
}

export async function saveQuoteTexts(introText: string, outroText: string) {
  await requireRole(CAN_ADMIN);
  // Sehr lange Texte begrenzen, damit die Settings-Spalte nicht explodiert
  const intro = (introText ?? "").slice(0, 4000);
  const outro = (outroText ?? "").slice(0, 4000);
  await setSetting("quoteIntroText" as SettingKey, intro);
  await setSetting("quoteOutroText" as SettingKey, outro);
  revalidatePath("/settings");
}

/** Analog zu saveQuoteTexts, für das Auftragsbestätigungs-PDF. */
export async function saveOrderConfirmationTexts(introText: string, outroText: string) {
  await requireRole(CAN_ADMIN);
  await setSetting("orderConfirmationIntroText" as SettingKey, (introText ?? "").slice(0, 4000));
  await setSetting("orderConfirmationOutroText" as SettingKey, (outroText ?? "").slice(0, 4000));
  revalidatePath("/settings");
}

/**
 * Vorgefertigter Betreff/Text für den "Per E-Mail senden"-Dialog beim
 * Erstellen eines Angebots. Platzhalter {{kunde}}, {{nummer}}, {{projekt}}
 * bleiben in der Vorlage unersetzt gespeichert.
 */
export async function saveQuoteEmailTexts(subject: string, body: string) {
  await requireRole(CAN_ADMIN);
  await setSetting("quoteEmailSubject" as SettingKey, (subject ?? "").trim().slice(0, 200));
  await setSetting("quoteEmailBody" as SettingKey, (body ?? "").slice(0, 4000));
  revalidatePath("/settings");
}

/** Analog zu saveQuoteEmailTexts, für den Versand von Auftragsbestätigungen. */
export async function saveOrderConfirmationEmailTexts(subject: string, body: string) {
  await requireRole(CAN_ADMIN);
  await setSetting("orderConfirmationEmailSubject" as SettingKey, (subject ?? "").trim().slice(0, 200));
  await setSetting("orderConfirmationEmailBody" as SettingKey, (body ?? "").slice(0, 4000));
  revalidatePath("/settings");
}

/** Analog zu saveQuoteEmailTexts, für den Rechnungs-Versand. */
export async function saveInvoiceEmailTexts(subject: string, body: string) {
  await requireRole(CAN_ADMIN);
  await setSetting("invoiceEmailSubject" as SettingKey, (subject ?? "").trim().slice(0, 200));
  await setSetting("invoiceEmailBody" as SettingKey, (body ?? "").slice(0, 4000));
  revalidatePath("/settings");
}

/**
 * Akzentfarbe für die Angebots-/Rechnungs-PDFs. Validiert auf das Hex-Format
 * "#RRGGBB". Ungültige Werte werden abgewiesen.
 */
export async function savePdfAccentColor(hex: string) {
  await requireRole(CAN_ADMIN);
  const cleaned = (hex ?? "").trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(cleaned)) {
    throw new Error("Farbe muss im Format #RRGGBB angegeben sein.");
  }
  await setSetting("pdfAccentColor" as SettingKey, cleaned.toLowerCase());
  revalidatePath("/settings");
}

export async function saveInvoiceDueDays(days: number) {
  await requireRole(CAN_ADMIN);
  const clamped = Math.max(0, Math.min(365, Math.floor(days) || 0));
  await setSetting("invoiceDueDays" as SettingKey, String(clamped));
  revalidatePath("/settings");
}

export async function regenerateCalendarToken(): Promise<string> {
  await requireRole(CAN_ADMIN);
  const fresh = crypto.randomUUID().replace(/-/g, "");
  await setSetting("calendarFeedToken" as SettingKey, fresh);
  revalidatePath("/settings");
  return fresh;
}

export async function saveDayFactorMap(factors: Record<number, number>) {
  await requireRole(CAN_ADMIN);
  const clean: Record<number, number> = {};
  for (let d = 1; d <= 10; d++) {
    const v = Number(factors[d]);
    if (!isFinite(v) || v < 0) {
      throw new Error(`Faktor für ${d} Tag(e) ungültig.`);
    }
    clean[d] = v;
  }
  await setSetting("dayFactorMap" as SettingKey, JSON.stringify(clean));
  revalidatePath("/settings");
}

export async function saveQuoteNumberSettings(
  prefix: string,
  padding: number,
  nextSequence: number
) {
  await requireRole(CAN_ADMIN);
  const p = (prefix ?? "").trim().toUpperCase().slice(0, 10);
  if (p && !/^[A-Z0-9-]+$/.test(p)) {
    throw new Error("Prefix darf nur Großbuchstaben, Zahlen und Bindestriche enthalten.");
  }
  const pad = Math.max(1, Math.min(8, Math.floor(padding) || 3));
  const next = Math.max(1, Math.floor(nextSequence) || 1);
  await setSetting("quoteNumberPrefix" as SettingKey, p);
  await setSetting("quoteNumberPadding" as SettingKey, String(pad));
  await setSetting("quoteNumberNextSequence" as SettingKey, String(next));
  revalidatePath("/settings");
}

export async function saveQuoteValidityDays(days: number) {
  await requireRole(CAN_ADMIN);
  const clamped = Math.max(0, Math.min(365, Math.floor(days) || 0));
  await setSetting("quoteValidityDays" as SettingKey, String(clamped));
  revalidatePath("/settings");
}

/** Analog zu saveQuoteNumberSettings, für Auftragsbestätigungen. */
export async function saveOrderConfirmationNumberSettings(
  prefix: string,
  padding: number,
  nextSequence: number
) {
  await requireRole(CAN_ADMIN);
  const p = (prefix ?? "").trim().toUpperCase().slice(0, 10);
  if (p && !/^[A-Z0-9-]+$/.test(p)) {
    throw new Error("Prefix darf nur Großbuchstaben, Zahlen und Bindestriche enthalten.");
  }
  const pad = Math.max(1, Math.min(8, Math.floor(padding) || 3));
  const next = Math.max(1, Math.floor(nextSequence) || 1);
  await setSetting("orderConfirmationNumberPrefix" as SettingKey, p);
  await setSetting("orderConfirmationNumberPadding" as SettingKey, String(pad));
  await setSetting("orderConfirmationNumberNextSequence" as SettingKey, String(next));
  revalidatePath("/settings");
}
