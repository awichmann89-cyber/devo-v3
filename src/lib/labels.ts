import { BillingUnit, EmploymentType, ExtraCostKind, ProjectKind, ProjectStatus, Role, ServiceItemKind } from "@prisma/client";

export function projectKindLabel(kind: ProjectKind): string {
  return {
    SPENDE: "Spende",
    DRYHIRE: "DryHire",
    FULL_SERVICE: "Full-Service",
    VERKAUF: "Verkauf",
  }[kind];
}

export function projectKindVariant(kind: ProjectKind): BadgeVariant {
  return {
    SPENDE: "warning" as const,
    DRYHIRE: "outline" as const,
    FULL_SERVICE: "default" as const,
    VERKAUF: "secondary" as const,
  }[kind];
}

export function projectStatusLabel(status: ProjectStatus): string {
  return {
    DRAFT: "Entwurf",
    CONFIRMED: "Bestätigt",
    ACTIVE: "Aktiv",
    COMPLETED: "Abgeschlossen",
    CANCELLED: "Storniert",
  }[status];
}

export function projectStatusVariant(status: ProjectStatus): BadgeVariant {
  return {
    DRAFT: "outline" as const,
    CONFIRMED: "secondary" as const,
    ACTIVE: "default" as const,
    COMPLETED: "success" as const,
    CANCELLED: "destructive" as const,
  }[status];
}

/** Emoji-Präfix für Kalendereinträge (ICS-Feeds) je Projekt-Status. */
export function projectStatusEmoji(status: ProjectStatus): string {
  return {
    DRAFT: "📝",
    CONFIRMED: "✅",
    ACTIVE: "🟢",
    COMPLETED: "🏁",
    CANCELLED: "❌",
  }[status];
}

/**
 * Zeilen-Klasse nach Projekt-Status (Redesign): statt Flächen-Tönung ein
 * 3px-Statusbalken links an der Zeile — Farben aus den Status-Tokens.
 */
export function projectStatusRowClass(status: ProjectStatus): string {
  return {
    DRAFT: "border-l-[3px] border-l-transparent",
    CONFIRMED: "border-l-[3px] border-l-info",
    ACTIVE: "border-l-[3px] border-l-primary",
    COMPLETED: "border-l-[3px] border-l-success",
    CANCELLED: "border-l-[3px] border-l-destructive",
  }[status];
}

// ---------- Rechnungs-Status ----------
// Analog zu den Projekt-Status-Helpern oben: Label und Badge-Variante gehören
// zusammen und dürfen nicht pro Tabelle neu erfunden werden.

export type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "info"
  | "subhire";

export type InvoiceStatus = "open" | "overdue" | "paid";

/** Leitet den Status aus Fälligkeit und Zahlungsdatum ab (tagesgenau). */
export function invoiceStatus(invoice: {
  paidAt: Date | string | null;
  dueDate: Date | string;
}): InvoiceStatus {
  if (invoice.paidAt) return "paid";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(invoice.dueDate);
  due.setHours(0, 0, 0, 0);
  return due < today ? "overdue" : "open";
}

export function invoiceStatusLabel(status: InvoiceStatus): string {
  return { open: "Offen", overdue: "Überfällig", paid: "Bezahlt" }[status];
}

export function invoiceStatusVariant(status: InvoiceStatus): BadgeVariant {
  return {
    open: "outline" as const,
    overdue: "destructive" as const,
    paid: "success" as const,
  }[status];
}

/** Typ-Label einer Rechnung: Rechnung, Vorkasse oder (n-te) Mahnung. */
export function invoiceKindLabel(invoice: {
  kind: "INVOICE" | "REMINDER";
  reminderLevel: number;
  isPrepayment: boolean;
}): string {
  if (invoice.kind === "REMINDER") {
    return invoice.reminderLevel > 1 ? `${invoice.reminderLevel}. Mahnung` : "Mahnung";
  }
  return invoice.isPrepayment ? "Vorkasse" : "Rechnung";
}

// ---------- Angebots-Status ----------

export type QuoteStatus = "valid" | "accepted" | "expired" | "superseded";

export function quoteStatus(quote: {
  acceptedAt: Date | string | null;
  expiresAt: Date | string;
  supersededByQuoteId?: string | null;
}): QuoteStatus {
  if (quote.supersededByQuoteId) return "superseded";
  if (quote.acceptedAt) return "accepted";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expires = new Date(quote.expiresAt);
  expires.setHours(0, 0, 0, 0);
  return expires < today ? "expired" : "valid";
}

export function quoteStatusLabel(status: QuoteStatus): string {
  return {
    valid: "Gültig",
    accepted: "Angenommen",
    expired: "Abgelaufen",
    superseded: "Ersetzt",
  }[status];
}

export function quoteStatusVariant(status: QuoteStatus): BadgeVariant {
  return {
    valid: "success" as const,
    accepted: "success" as const,
    expired: "secondary" as const,
    superseded: "outline" as const,
  }[status];
}

export function roleLabel(role: Role): string {
  return {
    ADMIN: "Administrator",
    DISPONENT: "Disponent",
    READER: "Leser",
  }[role];
}

export function employmentTypeLabel(type: EmploymentType): string {
  return {
    GESELLSCHAFTER: "Gesellschafter",
    MITARBEITER: "Mitarbeiter",
    FREELANCER: "Freelancer",
    MINIJOBBER: "Minijobber",
  }[type];
}

export function employmentTypeVariant(type: EmploymentType): BadgeVariant {
  return {
    GESELLSCHAFTER: "default" as const,
    MITARBEITER: "secondary" as const,
    FREELANCER: "warning" as const,
    MINIJOBBER: "outline" as const,
  }[type];
}

export function serviceItemKindLabel(kind: ServiceItemKind): string {
  return {
    PERSONAL: "Personal",
    TRANSPORT: "Transport",
    SONSTIGES: "Sonstiges",
  }[kind];
}

export function extraCostKindLabel(kind: ExtraCostKind): string {
  return {
    PERSONAL: "Personal",
    SONSTIGES: "Sonstiges",
  }[kind];
}

export function billingUnitLabel(unit: BillingUnit): string {
  return {
    HOUR: "Stunde",
    DAY: "Tag",
    FLAT: "Pauschale",
    PIECE: "Stück",
  }[unit];
}

// Kurzform für Tabellen-Spalten ("€ / ...")
export function billingUnitShort(unit: BillingUnit): string {
  return {
    HOUR: "h",
    DAY: "Tag",
    FLAT: "Pausch.",
    PIECE: "Stück",
  }[unit];
}

// Prisma-Decimals kommen je nach Aufrufer als Decimal-Objekt (Server) oder
// bereits als number/string (nach serialize()) an.
type DecimalLike = number | string | { toString(): string };

/**
 * Kurzbeschreibung eines Kabels für Listen, Packliste und PDF:
 * „10 m · XLR 5pol male → XLR 5pol female".
 *
 * Länge und Stecker sind einzeln optional — fehlende Angaben fallen weg,
 * ohne jede Angabe kommt null zurück. Ist nur ein Steckerende gepflegt,
 * wird nur dieses ausgegeben (ohne Pfeil).
 */
export function cableSpecLabel(cable: {
  lengthMeters?: DecimalLike | null;
  connectorA?: string | null;
  connectorB?: string | null;
}): string | null {
  const parts: string[] = [];

  if (cable.lengthMeters != null && cable.lengthMeters !== "") {
    const meters = Number(cable.lengthMeters);
    if (Number.isFinite(meters) && meters > 0) {
      // Nachkommastellen nur zeigen, wenn vorhanden (10 m statt 10,00 m)
      parts.push(`${String(meters).replace(".", ",")} m`);
    }
  }

  const a = cable.connectorA?.trim() || null;
  const b = cable.connectorB?.trim() || null;
  if (a && b) parts.push(`${a} → ${b}`);
  else if (a || b) parts.push((a ?? b) as string);

  return parts.length > 0 ? parts.join(" · ") : null;
}
