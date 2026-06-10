"use server";

import { revalidatePath } from "next/cache";
import { requireRole, CAN_ADMIN } from "@/lib/auth-helpers";
import { setSetting, SettingKey } from "@/lib/settings";

export async function saveCompanyAddress(
  name: string,
  street: string,
  zipCity: string,
  vatPercent: number
) {
  await requireRole(CAN_ADMIN);
  await setSetting("companyName" as SettingKey, (name ?? "").trim().slice(0, 200));
  await setSetting("companyStreet" as SettingKey, (street ?? "").trim().slice(0, 200));
  await setSetting("companyZipCity" as SettingKey, (zipCity ?? "").trim().slice(0, 200));
  const vat = Math.max(0, Math.min(100, Number(vatPercent) || 0));
  await setSetting("vatPercent" as SettingKey, String(vat));
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
