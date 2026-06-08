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

export function roleLabel(role: Role): string {
  return {
    ADMIN: "Administrator",
    DISPONENT: "Disponent",
    READER: "Leser",
  }[role];
}

export function serviceItemKindLabel(kind: ServiceIte