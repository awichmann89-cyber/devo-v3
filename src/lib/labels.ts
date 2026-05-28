import { DeviceStatus, ProjectStatus, Role } from "@prisma/client";

export function deviceStatusLabel(status: DeviceStatus): string {
  return {
    AVAILABLE: "Verfügbar",
    IN_USE: "Im Einsatz",
    MAINTENANCE: "Wartung",
    DEFECT: "Defekt",
    RETIRED: "Ausgemustert",
  }[status];
}

export function deviceStatusVariant(status: DeviceStatus): "default" | "secondary" | "destructive" | "outline" | "success" | "warning" {
  return {
    AVAILABLE: "success" as const,
    IN_USE: "default" as const,
    MAINTENANCE: "warning" as const,
    DEFECT: "destructive" as const,
    RETIRED: "outline" as const,
  }[status];
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
