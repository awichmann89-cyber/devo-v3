import { z } from "zod";
import {
  BillingUnit,
  EmploymentType,
  ExtraCostKind,
  InspectionResult,
  ProjectGroupKind,
  ProjectKind,
  ProjectStatus,
  Role,
  ServiceItemKind,
  VehicleKind,
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
  // .trim() vor den Längenchecks: Hersteller/Modell wurden früher roh
  // gespeichert, der daraus abgeleitete `name` dagegen aus getrimmten Werten
  // gebaut — ein angehängtes Leerzeichen ließ beide auseinanderlaufen und
  // druckte die Bezeichnung auf Angebot/Rechnung doppelt (siehe
  // deviceRowLabel in lib/labels.ts, Migration 31).
  name: z.string().trim().min(1, "Name erforderlich").max(150),
  manufacturer: z.string().trim().max(100).optional().nullable(),
  model: z.string().trim().max(100).optional().nullable(),
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
    // Bestehende Zeiträume werden per id aktualisiert statt neu angelegt —
    // sonst verlieren Personal-Einsätze und Gruppen ihre Zeitraum-Verknüpfung.
    id: z.string().optional().nullable(),
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

export const serviceItemSchema = z
  .object({
    name: z.string().min(1, "Name erforderlich").max(150),
    description: z.string().max(500).optional().nullable(),
    kind: z.nativeEnum(ServiceItemKind).default(ServiceItemKind.PERSONAL),
    unit: z.nativeEnum(BillingUnit).default(BillingUnit.HOUR),
    unitPrice: z.coerce.number().min(0).default(0),
    active: z.coerce.boolean().default(true),
    // Standard-Fuhrpark-Einheit (nur Transport): wird beim Buchen automatisch
    // eingeplant.
    defaultVehicleId: z.string().optional().nullable(),
  })
  // Transport (Fahrzeuge/Anhänger) wird immer pauschal gerechnet — die
  // Einheit wird still auf FLAT gezogen statt den Nutzer zu blockieren.
  // Umgekehrt trägt nur Transport eine Standard-Einheit; bei Umstellung der
  // Art fällt die Vorbelegung weg, statt unsichtbar weiterzuleben.
  .transform((d) =>
    d.kind === ServiceItemKind.TRANSPORT
      ? { ...d, unit: BillingUnit.FLAT }
      : { ...d, defaultVehicleId: null }
  );

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
  // Gruppe auf der Kosten-Seite (kind SUBHIRE). undefined = nicht ändern.
  costGroupId: z.string().optional().nullable(),
  supplier: z.string().max(200).optional().nullable(),
  quantity: z.coerce.number().int().min(1).default(1),
  unitCost: z.coerce.number().min(0).default(0),
  notes: z.string().max(500).optional().nullable(),
});

// Sonstige / personaltechnische Extrakosten.
export const extraCostSchema = z.object({
  label: z.string().min(1, "Bezeichnung erforderlich").max(200),
  // Gruppe auf der Kosten-Seite (kind EXTRA). undefined = nicht ändern.
  groupId: z.string().optional().nullable(),
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

// ---------- Personalplanung ----------

export const personSchema = z.object({
  name: z.string().min(1, "Name erforderlich").max(150),
  employmentType: z.nativeEnum(EmploymentType).default(EmploymentType.FREELANCER),
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
  active: z.coerce.boolean().default(true),
  hourlyWage: z.coerce.number().min(0).optional().nullable(),
  defaultDayRate: z.coerce.number().min(0).optional().nullable(),
  // Optionale Verknüpfung zu einem Cratel-Login (User.id)
  userId: z.string().optional().nullable(),
});

// Einsatz einer Person an einer Personal-&-Transport-Position.
export const personAssignmentSchema = z
  .object({
    personId: z.string().min(1),
    // Gewählter Berechnungszeitraum (null = Projekt-Planungszeitraum)
    billingPeriodId: z.string().optional().nullable(),
    plannedStart: z.coerce.date().optional().nullable(),
    plannedEnd: z.coerce.date().optional().nullable(),
    // Vergütung (Freelancer): Pauschale ODER Stundensatz — nie beides.
    agreedRate: z.coerce.number().min(0).optional().nullable(),
    hourlyRate: z.coerce.number().min(0).optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
  })
  .refine((d) => d.agreedRate == null || d.hourlyRate == null, {
    path: ["hourlyRate"],
    message: "Entweder Pauschale oder Stundensatz angeben",
  })
  .refine((d) => (d.plannedStart == null) === (d.plannedEnd == null), {
    path: ["plannedEnd"],
    message: "Start und Ende gemeinsam angeben oder beide leer lassen",
  })
  .refine((d) => !d.plannedStart || !d.plannedEnd || d.plannedEnd >= d.plannedStart, {
    path: ["plannedEnd"],
    message: "Ende muss nach Start liegen",
  });

/** "HH:MM" → Minuten seit Mitternacht. */
function parseClockMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

/** Netto-Arbeitsminuten mit Mitternachtsregel: Ende < Start ⇒ +24 h. */
export function computeWorkedMinutes(input: {
  start: string;
  end: string;
  breakMinutes: number;
}): number {
  const start = parseClockMinutes(input.start);
  let end = parseClockMinutes(input.end);
  if (end < start) end += 1440;
  return end - start - input.breakMinutes;
}

// Ist-Arbeitszeit. Beginn/Ende als "HH:MM"-Wanduhr-Strings — die Action
// wandelt sie in startMinute/endMinute um (siehe TimeEntry im Schema).
export const timeEntrySchema = z
  .object({
    workDate: z.coerce.date(),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format HH:MM"),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format HH:MM"),
    breakMinutes: z.coerce.number().int().min(0).max(720).default(0),
    notes: z.string().max(500).optional().nullable(),
  })
  .refine((d) => computeWorkedMinutes(d) > 0, {
    path: ["end"],
    message: "Arbeitszeit muss länger als die Pause sein",
  })
  .refine((d) => computeWorkedMinutes(d) <= 16 * 60, {
    path: ["end"],
    message: "Mehr als 16 Stunden — bitte prüfen",
  });

// ---------- Fuhrpark ----------

export const vehicleSchema = z.object({
  name: z.string().min(1, "Name erforderlich").max(150),
  kind: z.nativeEnum(VehicleKind).default(VehicleKind.FAHRZEUG),
  licensePlate: z.string().max(20).optional().nullable(),
  loadCapacityKg: z.coerce.number().int().min(0).max(100000).optional().nullable(),
  grossWeightKg: z.coerce.number().int().min(0).max(100000).optional().nullable(),
  requiredLicense: z.string().max(20).optional().nullable(),
  nextInspection: z.coerce.date().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  active: z.coerce.boolean().default(true),
});

// Einsatz einer Fuhrpark-Einheit an einer Transport-Position.
// Ohne Zeitraum und ohne Uhrzeiten blockt der Einsatz den gesamten
// Projekt-Planungszeitraum (Regelfall) — siehe schema.prisma.
export const vehicleAssignmentSchema = z
  .object({
    vehicleId: z.string().min(1),
    billingPeriodId: z.string().optional().nullable(),
    plannedStart: z.coerce.date().optional().nullable(),
    plannedEnd: z.coerce.date().optional().nullable(),
    driverId: z.string().optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
  })
  .refine((d) => (d.plannedStart == null) === (d.plannedEnd == null), {
    path: ["plannedEnd"],
    message: "Start und Ende gemeinsam angeben oder beide leer lassen",
  })
  .refine((d) => !d.plannedStart || !d.plannedEnd || d.plannedEnd >= d.plannedStart, {
    path: ["plannedEnd"],
    message: "Ende muss nach Start liegen",
  });

export const userSchema = z.object({
  email: z.string().email("Ungültige Email-Adresse").max(150),
  name: z.string().max(150).optional().nullable(),
  role: z.nativeEnum(Role).default(Role.READER),
  password: z.string().min(6, "Mindestens 6 Zeichen").max(200).optional().nullable(),
});
