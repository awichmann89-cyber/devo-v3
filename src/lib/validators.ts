import { z } from "zod";
import {
  BillingUnit,
  ExtraCostKind,
  InspectionResult,
  ProjectGroupKind,
  ProjectKind,
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
  parentId: z.string().optional().nullable(),
});

export const packUnitSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1, "Name erforderlich").max(100),
  description: z.string().max(500).optional().nullable(),
  weight: z.coerce.number().min(0).optional().nullable(),
  stockQuantity: z.coerce.number().int().min(1).default(1),
  packMode: z.enum(["FIXED", "VARIABLE"]).default("FIXED"),
  categoryId: z.string().optional().nullable(),
  locationId: z.string().optional().nullable(),
});

export const deviceSchema = z.object({
  name: z.string().min(1, "Name erforderlich").max(150),
  manufacturer: z.string().max(100).optional().nullable(),
  model: z.string().max(100).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  stockQuantity: z.coerce.number().int().min(1).default(1),
  dailyRate: z.coerce.number().min(0).default(0),
  replacementValue: z.coerce.number().min(0).optional().nullable(),
  weight: z.coerce.number().min(0).optional().nullable(),
  powerWatts: z.coerce.number().int().min(0).optional().nullable(),
  inspectionExempt: z.coerce.boolean().default(false),
  showOnDocuments: z.coerce.boolean().default(true),
  categoryId: z.string().optional().nullable(),
});

export const cableSchema = z.object({
  name: z.string().min(1, "Name erforderlich").max(150),
  description: z.string().max(1000).optional().nullable(),
  cableType: z.string().max(60).optional().nullable(),
  lengthMeters: z.coerce.number().min(0).optional().nullable(),
  connectorA: z.string().max(80).optional().nullable(),
  connectorB: z.string().max(80).optional().nullable(),
  stockQuantity: z.coerce.number().int().min(1).default(1),
  replacementValue: z.coerce.number().min(0).optional().nullable(),
  weight: z.coerce.number().min(0).optional().nullable(),
  inspectionExempt: z.coerce.boolean().default(false),
  categoryId: z.string().optional().nullable(),
});

export const cableUnitSchema = z.object({
  barcode: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const cableAssignmentSchema = z.object({
  cableId: z.string().min(1),
  groupId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).default(1),
  notes: z.string().max(500).optional().nullable(),
});

export const inspectionSchema = z.object({
  date: z.coerce.date().default(() => new Date()),
  result: z.nativeEnum(InspectionResult),
  testerName: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const serialNumberSchema = z.object({
  serialNumber: z.string().min(1, "Seriennummer erforderlich").max(100),
  barcode: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const packUnitItemSchema = z.object({
  deviceId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).default(1),
  notes: z.string().max(500).optional().nullable(),
});

export const packUnitCableItemSchema = z.object({
  cableId: z.string().min(1),
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
    kind: z.nativeEnum(ProjectKind).default(ProjectKind.DRYHIRE),
    planningStart: z.coerce.date(),
    planningEnd: z.coerce.date(),
    billingPeriods: z
      .array(billingPeriodSchema)
      .min(1, "Mindestens ein Berechnungszeitraum erforderlich"),
    discountPercent: z.coerce.number().min(0).max(100).default(0),
    notes: z.string().max(2000).optional().nullable(),
    maintainerId: z.string().optional().nullable(),
  })
  .refine((d) => d.planningEnd >= d.planningStart, {
    path: ["planningEnd"],
    message: "Planungs-Ende muss nach Start liegen",
  });

export const projectUpdateCoreSchema = z.object({
  name: z.string().min(1, "Name erforderlich").max(200),
  customerId: z.string().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  status: z.nativeEnum(ProjectStatus).default(ProjectStatus.DRAFT),
  kind: z.nativeEnum(ProjectKind).default(ProjectKind.DRYHIRE),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  notes: z.string().max(2000).optional().nullable(),
  maintainerId: z.string().optional().nullable(),
});

export const projectPeriodsSchema = z
  .object({
    planningStart: z.coerce.date(),
    planningEnd: z.coerce.date(),
    billingPeriods: z
      .array(billingPeriodSchema)
      .min(1, "Mindestens ein Berechnungszeitraum erforderlich"),
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
    .union([z.coerce.number().min(0), z.null()])
    .optional()
    .nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const assignmentSchema = z.object({
  deviceId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).default(1),
  groupId: z.string().min(1),
  notes: z.string().max(500).optional().nullable(),
});

// Zumietung: zugemietetes Material (rein interne Kostenposition).
export const subhireSchema = z.object({
  name: z.string().min(1, "Bezeichnung erforderlich").max(200),
  // Optionale Verknüpfung zu einem Katalog-Gerät, einer Ad-hoc-Position
  // („Vorübergehendes Gerät") bzw. einer Material-Gruppe.
  deviceId: z.string().optional().nullable(),
  adHocItemId: z.string().optional().nullable(),
  groupId: z.string().optional().nullable(),
  supplier: z.string().max(200).optional().nullable(),
  quantity: z.coerce.number().int().min(1).default(1),
  unitCost: z.coerce.number().min(0).default(0),
  notes: z.string().max(500).optional().nullable(),
});

// Sonstige / personaltechnische Extrakosten.
export const extraCostSchema = z.object({
  label: z.string().min(1, "Bezeichnung erforderlich").max(200),
  kind: z.nativeEnum(ExtraCostKind).default("SONSTIGES"),
  amount: z.coerce.number().min(0).default(0),
  notes: z.string().max(500).optional().nullable(),
});

export const projectGroupSchema = z.object({
  name: z.string().min(1, "Name erforderlich").max(100),
  kind: z.nativeEnum(ProjectGroupKind),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  sortOrder: z.coerce.number().int().default(0),
  billable: z.coerce.boolean().default(true),
});

export const projectNoteSchema = z.object({
  title: z.string().min(1, "Titel erforderlich").max(200),
  content: z.string().max(20000).default(""),
});

export const invoiceCreateSchema = z.object({
  invoiceDate: z.coerce.date().default(() => new Date()),
  dueDate: z.coerce.date().optional().nullable(),
  vatPercent: z.coerce.number().min(0).max(100).default(19),
  customSequence: z.coerce.number().int().min(1).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const userSchema = z.object({
  email: z.string().email("Ungültige Email-Adresse").max(150),
  name: z.string().max(150).optional().nullable(),
  role: z.nativeEnum(Role).default(Role.READER),
  password: z.string().min(6, "Mindestens 6 Zeichen").max(200).optional().nullable(),
});
