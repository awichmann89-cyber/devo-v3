import { z } from "zod";
import {
  BillingUnit,
  DeviceStatus,
  ProjectGroupKind,
  ProjectStatus,
  Role,
  ServiceItemKind,
} from "@prisma/client";

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

export const customerSchema = z.object({
  name: z.string().min(1, "Name erforderlich").max(200),
  contactPerson: z.string().max(150).optional().nullable(),
  email: z
    .string()
    .max(150)
    .optional()
    .nullable()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "Ungültige Email-Adresse",
    }),
  phone: z.string().max(50).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const billingPeriodSchema = z
  .object({
    start: z.coerce.date(),
    end: z.coerce.date(),
    notes: z.string().max(200).optional().nullable(),
  })
  .refine((d) => d.end >= d.start, {
    path: ["end"],
    message: "Ende muss nach Start liegen",
  });

export const projectSchema = z
  .object({
    name: z.string().min(1, "Name erforderlich").max(200),
    customerId: z.string().optional().nullable(),
    description: z.string().max(2000).optional().nullable(),
    status: z.nativeEnum(ProjectStatus).default(ProjectStatus.DRAFT),
    planningStart: z.coerce.date(),
    planningEnd: z.coerce.date(),
    billingPeriods: z
      .array(billingPeriodSchema)
      .min(1, "Mindestens ein Berechnungszeitraum erforderlich"),
    discountPercent: z.coerce.number().min(0).max(100).default(0),
    notes: z.string().max(2000).optional().nullable(),
  })
  .refine((d) => d.planningEnd >= d.planningStart, {
    path: ["planningEnd"],
    message: "Planungs-Ende muss nach Start liegen",
  });

export const serviceItemSchema = z.object({
  name: z.string().min(1, "Name erforderlich").max(150),
  description: z.string().max(500).optional().nullable(),
  kind: z.nativeEnum(ServiceItemKind).default(ServiceItemKind.PERSONAL),
  unit: z.nativeEnum(BillingUnit).default(BillingUnit.HOUR),
  unitPrice: z.coerce.number().min(0).default(0),
  active: z.coerce.boolean().default(true),
});

export const projectServiceSchema = z.object({
  serviceItemId: z.string().min(1),
  groupId: z.string().min(1),
  quantity: z.coerce.number().min(0).default(1),
  unitPriceOverride: z
    .union([z.coerce.number().min(0), z.literal("").transform(() => null), z.null()])
    .optional()
    .nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const projectNoteSchema = z.object({
  title: z.string().min(1, "Titel erforderlich").max(200),
  content: z.string().min(1, "Inhalt erforderlich").max(50000),
});

export const projectGroupSchema = z.object({
  name: z.string().min(1, "Name erforderlich").max(100),
  kind: z.nativeEnum(ProjectGroupKind),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const assignmentSchema = z.object({
  packUnitId: z.string().min(1),
  groupId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).default(1),
  notes: z.string().max(500).optional().nullable(),
});

export const userSchema = z.object({
  email: z.string().email("Ungültige Email"),
  name: z.string().max(100).optional().nullable(),
  password: z.string().min(6, "Mindestens 6 Zeichen").optional(),
  role: z.nativeEnum(Role).default(Role.READER),
});

export type CustomerInput = z.infer<typeof customerSchema>;
export type LocationInput = z.infer<typeof locationSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type PackUnitInput = z.infer<typeof packUnitSchema>;
export type DeviceInput = z.infer<typeof deviceSchema>;
export type SerialNumberInput = z.infer<typeof serialNumberSchema>;
export type PackUnitItemInput = z.infer<typeof packUnitItemSchema>;
export type BillingPeriodInput = z.infer<typeof billingPeriodSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;
export type ProjectNoteInput = z.infer<typeof projectNoteSchema>;
export type ServiceItemInput = z.infer<typeof serviceItemSchema>;
export type ProjectServiceInput = z.infer<typeof projectServiceSchema>;
export type ProjectGroupInput = z.infer<typeof projectGroupSchema>;
export type AssignmentInput = z.infer<typeof assignmentSchema>;
export type UserInput = z.infer<typeof userSchema>;
