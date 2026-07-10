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
