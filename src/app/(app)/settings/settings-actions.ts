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
