import { z } from "zod";
import { DeviceStatus, ProjectStatus, Role } from "@prisma/client";

export const locationSchema = z.object({
  name: z.string().min(1, "Name erforderlich").max(100),
  description: z.string().max(500).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
});

export const categorySchema = z.object({
  name: z.string().min(1, "Name erforderlich").max(100),
  prefix: z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Z0-9]+$/, "Nur Großbuchstaben und Zahlen")
    .optional()
    .nullable(),
  parentId: z.string().optional().nullable(),
});

export const packUnitSchema = z.object({
  // code optional — wird bei Create automatisch erzeugt
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1, "Name erforderlich").max(100),
  description: z.string().max(500).optional().nullable(),
  weight: z.coerce.number().min(0).optional().nullable(),
  stockQuantity: z.coerce.number().int().min(1).default(1),
  categoryId: z.string().optional().nullable(),
  locationId: z.string().optional().nullable(),
});

// Device als Typ mit Bestand.
export const deviceSchema = z.object({
  name: z.string().min(1, "Name erforderlich").max(150),
  manufacturer: z.string().max(100).optional().nullable(),
  model: z.string().max(100).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  status: z.nativeEnum(DeviceStatus).default(DeviceStatus.AVAILABLE),
  stockQuantity: z.coerce.number().int().min(1).default(1),
  dailyRate: z.coerce.number().min(0).default(0),
  replacementValue: z.coerce.number().min(0).optional().nullable(),
  weight: z.coerce.number().min(0).optional().nullable(),
  powerWatts: z.coerce.number().int().min(0).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  categoryId: z.string().optional().nullable(),
});

// Seriennummer pro Device
export const serialNumberSchema = z.object({
  serialNumber: z.string().min(1, "Seriennummer erforderlich").max(100),
  notes: z.string().max(500).optional().nullable(),
});

// Verknüpfung Packeinheit ↔ Device mit Anzahl pro Case
export const packUnitItemSchema = z.object({
  deviceId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).default(1),
  notes: z.string().max(500).optional().nullable(),
});

export const projectSchema = z
  .object({
    name: z.string().min(1, "Name erforderlich").max(200),
    customer: z.string().max(200).optional().nullable(),
    description: z.string().max(2000).optional().nullable(),
    status: z.nativeEnum(ProjectStatus).default(ProjectStatus.DRAFT),
    planningStart: z.coerce.date(),
    planningEnd: z.coerce.date(),
    billingStart: z.coerce.date(),
    billingEnd: z.coerce.date(),
    discountPercent: z.coerce.number().min(0).max(100).default(0),
    notes: z.string().max(2000).optional().nullable(),
  })
  .refine((d) => d.planningEnd >= d.planningStart, {
    path: ["planningEnd"],
    message: "Planungs-Ende muss nach Start liegen",
  })
  .refine((d) => d.billingEnd >= d.billingStart, {
    path: ["billingEnd"],
    message: "Berechnungs-Ende muss nach Start liegen",
  });

export const assignmentSchema = z.object({
  packUnitId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).default(1),
  notes: z.string().max(500).optional().nullable(),
});

export const userSchema = z.object({
  email: z.string().email("Ungültige Email"),
  name: z.string().max(100).optional().nullable(),
  password: z.string().min(6, "Mindestens 6 Zeichen").optional(),
  role: z.nativeEnum(Role).default(Role.READER),
});

export type LocationInput = z.infer<typeof locationSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type PackUnitInput = z.infer<typeof packUnitSchema>;
export type DeviceInput = z.infer<typeof deviceSchema>;
export type SerialNumberInput = z.infer<typeof serialNumberSchema>;
export type PackUnitItemInput = z.infer<typeof packUnitItemSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;
export type AssignmentInput = z.infer<typeof assignmentSchema>;
export type UserInput = z.infer<typeof userSchema>;
