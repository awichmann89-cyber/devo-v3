import { BillingUnit, ProjectKind, ProjectStatus, Role, ServiceItemKind } from "@prisma/client";

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
 * Hintergrund-Klasse für eine Tabellenzeile, sehr dezent eingefärbt nach
 * Projekt-Status. DRAFT bleibt neutral (kein Hintergrund), die anderen
 * bekommen einen leichten Tönungs-Hauch.
 */
export function projectStatusRowClass(status: ProjectStatus): string {
  return {
    DRAFT: "",
    CONFIRMED: "bg-green-50/40 hover:bg-green-100 dark:bg-green-950/15 dark:hover:bg-green-900/40",
    ACTIVE: "bg-blue-50/40 hover:bg-blue-100 dark:bg-blue-950/15 dark:hover:bg-blue-900/40",
    COMPLETED: "bg-emerald-50/40 hover:bg-emerald-100 dark:bg-emerald-950/15 dark:hover:bg-emerald-900/40",
    CANCELLED: "bg-red-50/35 hover:bg-red-100 dark:bg-red-950/15 dark:hover:bg-red-900/40",
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
