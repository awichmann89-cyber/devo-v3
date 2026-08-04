/**
 * Document-Snapshot — Immutable Render-Daten für Rechnungen, Mahnungen und
 * Angebote.
 *
 * Hintergrund: Rechnungen und Angebote sollen unveränderlich sein, sobald sie
 * einmal ausgegeben wurden (GoBD / §14 UStG). Wenn ein Projekt nach
 * Erstellung der Rechnung geändert wird (Gerät hinzu, Preis angepasst,
 * Rabatt verschoben), darf das die schon ausgegebene Rechnung nicht mehr
 * verändern.
 *
 * Lösung: Beim Anlegen wird der komplette Stand der Render-Daten
 * (Empfänger, Positionen, Preise, Rabatte, Settings-relevante Werte) als
 * JSON-Snapshot gespeichert. Die PDF-Routen rendern daraus statt aus den
 * Live-Projektdaten.
 *
 * Bestehende Alt-Rechnungen ohne Snapshot fallen auf die Live-Daten zurück;
 * der Builder kann beide Pfade erzeugen (siehe `buildSnapshotFromProject`).
 */
import { Prisma } from "@prisma/client";
import { billingUnitLabel, serviceItemKindLabel } from "@/lib/labels";
import { daysBetween } from "@/lib/utils";
import { parseDayFactorMap, getDayFactor } from "@/lib/settings";

/** Version-Tag — bei Brüchen am Format wird hier hochgezählt. */
export const DOCUMENT_SNAPSHOT_VERSION = 1;

export interface DocumentSnapshot {
  version: number;

  /** Empfänger-Anschrift wie zum Zeitpunkt der Ausgabe. */
  customer: {
    name: string;
    contactPerson: string | null;
    address: string | null;
  } | null;

  /** Projekt-Stammdaten — name, kind, Rabatte, Berechnungszeiträume. */
  project: {
    name: string;
    kind: string;
    /** ISO-Strings, damit JSON-roundtrip-fest. */
    billingPeriods: Array<{ start: string; end: string }>;
    discountPercent: number;
    materialDiscountPercent: number;
    servicesDiscountPercent: number;
  };

  /** Verantwortlicher (für Signatur im Angebots-PDF). */
  maintainer: { name: string | null; email: string | null } | null;

  /** Mietzeit-Berechnung zum Zeitpunkt der Erstellung. */
  days: number;
  factor: number;
  isSale: boolean;

  /**
   * Material- und Service-Gruppen mit allen Items inline.
   * Geräte sind bereits nach name|manufacturer|model|dailyRate aggregiert.
   * Nicht-abrechenbare Gruppen werden NICHT geschrieben — die fallen schon
   * beim Bauen weg.
   */
  groups: Array<{
    id: string;
    name: string;
    kind: "MATERIAL" | "SERVICE";
    discountPercent: number;
    sortOrder: number;
    /**
     * Tagesfaktor der Gruppe (Migration 25: Zeiträume pro Materialgruppe).
     * Fehlt bei Alt-Snapshots — dann gilt der globale `factor`/`days`.
     */
    days?: number;
    factor?: number;
    materialRows: Array<{
      name: string;
      manufacturer: string | null;
      model: string | null;
      description: string | null;
      dailyRate: number;
      quantity: number;
      sortOrder: number;
    }>;
    adHocRows: Array<{
      name: string;
      description: string | null;
      unitPrice: number;
      quantity: number;
      sortOrder: number;
    }>;
    serviceRows: Array<{
      name: string;
      kind: string;
      unit: string;
      quantity: number;
      price: number;
      sortOrder: number;
    }>;
    comments: Array<{ text: string; sortOrder: number }>;
  }>;

  /** Settings-Snapshot — alle für die Ausgabe relevanten Werte. */
  settings: {
    vatPercent: number;
    companyName: string;
    companyStreet: string;
    companyZipCity: string;
    /** Nur für Angebote relevant — bei Rechnungen leer. */
    quoteIntroText: string;
    quoteOutroText: string;
    /** Akzentfarbe als Hex-String, z.B. "#1e3a8a". Für Gruppen-Header & Trennstrich. */
    pdfAccentColor: string;
  };

  /** Zur Anzeige berechnete Summen — informativ, wird beim Rendern neu berechnet. */
  totals: {
    totalNet: number;
    totalGross: number;
    vatAmount: number;
  };
}

/** Project mit allen Includes, die der Snapshot-Builder benötigt. */
export type ProjectForSnapshot = Prisma.ProjectGetPayload<{
  include: {
    customer: true;
    billingPeriods: true;
    groups: { include: { billingPeriods: true } };
    assignments: { include: { device: true } };
    services: { include: { serviceItem: true } };
    adHocItems: true;
    groupComments: true;
    maintainer: { select: { name: true; email: true } };
  };
}>;

/** Settings-Felder, die für die Ausgabe benötigt werden. */
export interface SettingsForSnapshot {
  vatPercent: number | string | Prisma.Decimal;
  companyName: string;
  companyStreet: string;
  companyZipCity: string;
  dayFactorMap: string;
  quoteIntroText?: string | null;
  quoteOutroText?: string | null;
  pdfAccentColor?: string | null;
}

/**
 * Baut den Snapshot aus dem aktuellen Projekt + Settings. Wird sowohl beim
 * `createInvoice` / `createQuote` aufgerufen UND als Fallback in den
 * PDF-Routen für Alt-Bestand ohne gespeicherten Snapshot.
 */
export function buildSnapshotFromProject(
  project: ProjectForSnapshot,
  settings: SettingsForSnapshot,
): DocumentSnapshot {
  const days = project.billingPeriods.reduce(
    (sum, p) => sum + daysBetween(p.start, p.end),
    0,
  );
  const isSale = project.kind === "VERKAUF";
  const factorMap = parseDayFactorMap(settings.dayFactorMap);
  const factor = isSale ? 1 : getDayFactor(days, factorMap);

  // Tagesfaktor pro Gruppe: Materialgruppen mit eigener Zeitraum-Auswahl
  // rechnen nur über deren Tage; ohne Auswahl gilt der globale Wert.
  const groupPeriodInfo = new Map<string, { days: number; factor: number }>();
  for (const g of project.groups) {
    const periods =
      g.billingPeriods.length > 0 ? g.billingPeriods : project.billingPeriods;
    const gDays = periods.reduce(
      (sum, p) => sum + daysBetween(p.start, p.end),
      0,
    );
    groupPeriodInfo.set(g.id, {
      days: gDays,
      factor: isSale ? 1 : getDayFactor(gDays, factorMap),
    });
  }

  // Aggregierte Material-Zeilen pro Gruppe — gleicher Algorithmus wie früher
  // in den PDF-Routen, hier zentral.
  type MaterialRow = DocumentSnapshot["groups"][number]["materialRows"][number];
  const materialByGroup = new Map<string, MaterialRow[]>();
  for (const a of project.assignments) {
    if (!a.device.showOnDocuments) continue;
    const groupMap = materialByGroup.get(a.groupId) ?? ([] as MaterialRow[]);
    const lookup = new Map<string, MaterialRow>();
    for (const r of groupMap) {
      lookup.set(
        `${r.name}|${r.manufacturer}|${r.model}|${r.dailyRate}`,
        r,
      );
    }
    const aSort = a.sortOrder ?? 0;
    const key = `${a.device.name}|${a.device.manufacturer}|${a.device.model}|${Number(a.device.dailyRate)}`;
    const existing = lookup.get(key);
    if (existing) {
      existing.quantity += a.quantity;
      if (aSort < existing.sortOrder) existing.sortOrder = aSort;
    } else {
      const row: MaterialRow = {
        name: a.device.name,
        manufacturer: a.device.manufacturer,
        model: a.device.model,
        description: a.device.description,
        dailyRate: Number(a.device.dailyRate),
        quantity: a.quantity,
        sortOrder: aSort,
      };
      lookup.set(key, row);
      groupMap.push(row);
    }
    materialByGroup.set(a.groupId, groupMap);
  }
  for (const arr of materialByGroup.values()) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  type AdHocRow = DocumentSnapshot["groups"][number]["adHocRows"][number];
  const adHocByGroup = new Map<string, AdHocRow[]>();
  for (const it of project.adHocItems) {
    const arr = adHocByGroup.get(it.groupId) ?? [];
    arr.push({
      name: it.name,
      description: it.description,
      unitPrice: Number(it.unitPrice),
      quantity: it.quantity,
      sortOrder: it.sortOrder ?? 0,
    });
    adHocByGroup.set(it.groupId, arr);
  }
  for (const arr of adHocByGroup.values()) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  type ServiceRow = DocumentSnapshot["groups"][number]["serviceRows"][number];
  const servicesByGroup = new Map<string, ServiceRow[]>();
  for (const ps of project.services) {
    const arr = servicesByGroup.get(ps.groupId) ?? [];
    arr.push({
      name: ps.serviceItem.name,
      kind: serviceItemKindLabel(ps.serviceItem.kind),
      unit: billingUnitLabel(ps.serviceItem.unit),
      quantity: Number(ps.quantity),
      price: ps.unitPriceOverride
        ? Number(ps.unitPriceOverride)
        : Number(ps.serviceItem.unitPrice),
      sortOrder: ps.sortOrder ?? 0,
    });
    servicesByGroup.set(ps.groupId, arr);
  }
  for (const arr of servicesByGroup.values()) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  type CommentRow = DocumentSnapshot["groups"][number]["comments"][number];
  const commentsByGroup = new Map<string, CommentRow[]>();
  for (const c of project.groupComments) {
    const arr = commentsByGroup.get(c.groupId) ?? [];
    arr.push({ text: c.text, sortOrder: c.sortOrder ?? 0 });
    commentsByGroup.set(c.groupId, arr);
  }
  for (const arr of commentsByGroup.values()) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // Nur abrechenbare MATERIAL- und SERVICE-Gruppen schreiben. Gebuchte Kabel
  // haben keinen Preis und erscheinen nie auf Finanzdokumenten — eine Gruppe,
  // in der NUR Kabel liegen, bliebe also komplett leer und wird deshalb
  // (wie jede andere leere Gruppe) gar nicht erst als Überschrift ausgegeben.
  const groups: DocumentSnapshot["groups"] = project.groups
    .filter(
      (g) =>
        g.billable && (g.kind === "MATERIAL" || g.kind === "SERVICE"),
    )
    .map((g) => ({
      id: g.id,
      name: g.name,
      kind: g.kind as "MATERIAL" | "SERVICE",
      discountPercent: Number(g.discountPercent),
      sortOrder: g.sortOrder ?? 0,
      days: groupPeriodInfo.get(g.id)?.days ?? days,
      factor: groupPeriodInfo.get(g.id)?.factor ?? factor,
      materialRows: materialByGroup.get(g.id) ?? [],
      adHocRows: adHocByGroup.get(g.id) ?? [],
      serviceRows: servicesByGroup.get(g.id) ?? [],
      comments: commentsByGroup.get(g.id) ?? [],
    }))
    .filter(
      (g) =>
        g.materialRows.length > 0 ||
        g.adHocRows.length > 0 ||
        g.serviceRows.length > 0 ||
        g.comments.length > 0,
    );

  // Berechnung der Summen — identisch zur PDF-Logik.
  let materialBereichSub = 0;
  let servicesBereichSub = 0;
  for (const g of groups) {
    if (g.kind === "MATERIAL") {
      const gFactor = g.factor ?? factor;
      const subDevices = g.materialRows.reduce(
        (s, r) => s + r.dailyRate * r.quantity * gFactor,
        0,
      );
      const subAdHoc = g.adHocRows.reduce(
        (s, r) => s + r.unitPrice * r.quantity * gFactor,
        0,
      );
      const sub = subDevices + subAdHoc;
      const net = sub - (sub * g.discountPercent) / 100;
      materialBereichSub += net;
    } else {
      const sub = g.serviceRows.reduce(
        (s, r) => s + r.quantity * r.price,
        0,
      );
      const net = sub - (sub * g.discountPercent) / 100;
      servicesBereichSub += net;
    }
  }
  const materialBereichNet =
    materialBereichSub -
    (materialBereichSub * Number(project.materialDiscountPercent)) / 100;
  const servicesBereichNet =
    servicesBereichSub -
    (servicesBereichSub * Number(project.servicesDiscountPercent)) / 100;
  const subAfterAll = materialBereichNet + servicesBereichNet;
  const totalNet =
    subAfterAll -
    (subAfterAll * Number(project.discountPercent)) / 100;
  const vatPercent = Number(settings.vatPercent) || 0;
  const vatAmount = (totalNet * vatPercent) / 100;
  const totalGross = totalNet + vatAmount;

  return {
    version: DOCUMENT_SNAPSHOT_VERSION,
    customer: project.customer
      ? {
          name: project.customer.name,
          contactPerson: project.customer.contactPerson,
          address: project.customer.address,
        }
      : null,
    project: {
      name: project.name,
      kind: project.kind,
      billingPeriods: project.billingPeriods.map((p) => ({
        start: p.start.toISOString(),
        end: p.end.toISOString(),
      })),
      discountPercent: Number(project.discountPercent),
      materialDiscountPercent: Number(project.materialDiscountPercent),
      servicesDiscountPercent: Number(project.servicesDiscountPercent),
    },
    maintainer: project.maintainer
      ? {
          name: project.maintainer.name,
          email: project.maintainer.email,
        }
      : null,
    days,
    factor,
    isSale,
    groups,
    settings: {
      vatPercent,
      companyName: settings.companyName,
      companyStreet: settings.companyStreet,
      companyZipCity: settings.companyZipCity,
      quoteIntroText: (settings.quoteIntroText ?? "").trim(),
      quoteOutroText: (settings.quoteOutroText ?? "").trim(),
      pdfAccentColor: (settings.pdfAccentColor ?? "").trim() || "#1e3a8a",
    },
    totals: {
      totalNet: round2(totalNet),
      totalGross: round2(totalGross),
      vatAmount: round2(vatAmount),
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Type-Guard: prüft ob ein vom JSON-Feld kommendes Wert tatsächlich ein
 * Snapshot der aktuellen Version ist. Bei Fehlschlag wird vom Caller auf
 * Live-Daten zurückgefallen.
 */
export function isValidSnapshot(value: unknown): value is DocumentSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<DocumentSnapshot>;
  return (
    typeof v.version === "number" &&
    Array.isArray(v.groups) &&
    v.project !== undefined &&
    v.settings !== undefined &&
    v.totals !== undefined
  );
}
