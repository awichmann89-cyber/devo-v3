import { BillingUnit, ExtraCostKind, ProjectKind, ProjectStatus, Role, ServiceItemKind } from "@prisma/client";

export function projectKindLabel(kind: ProjectKind): string {
  return {
    SPENDE: "Spende",
    DRYHIRE: "DryHire",
    FULL_SERVICE: "Full-Service",
    VERKAUF: "Verkauf",
  }[kind];
}

export function projectKindVariant(
  kind: ProjectKind
): "default" | "secondary" | "destructive" | "outline" | "success" | "warning" {
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

export function projectStatusVariant(status: ProjectStatus): "default" | "secondary" | "destructive" | "outline" | "success" | "warning" {
  return {
    DRAFT: "outline" as const,
    CONFIRMED: "secondary" as const,
    ACTIVE: "default" as const,
    COMPLETED: "success" as const,
    CANCELLED: "destructive" as const,
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

export function roleLabel(role: Role): string {
  return {
    ADMIN: "Administrator",
    DISPONENT: "Disponent",
    READER: "Leser",
  }[role];
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
