import {
  PrismaClient,
  Role,
  ProjectStatus,
  ServiceItemKind,
  BillingUnit,
  ProjectGroupKind,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@devo.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin123";

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "Admin",
      passwordHash,
      role: Role.ADMIN,
    },
  });

  const disponentHash = await bcrypt.hash("disponent123", 10);
  await prisma.user.upsert({
    where: { email: "disponent@devo.local" },
    update: {},
    create: {
      email: "disponent@devo.local",
      name: "Max Disponent",
      passwordHash: disponentHash,
      role: Role.DISPONENT,
    },
  });

  // Lagerorte
  const hauptlager = await prisma.location.upsert({
    where: { name: "Hauptlager" },
    update: {},
    create: { name: "Hauptlager", description: "Zentrales Lager", address: "Lagerstr. 1, 12345 Berlin" },
  });

  await prisma.location.upsert({
    where: { name: "Außenlager" },
    update: {},
    create: { name: "Außenlager", description: "Zweitlager" },
  });

  // Kategorien
  const ton = await prisma.category.upsert({
    where: { name: "Ton" },
    update: {},
    create: { name: "Ton" },
  });
  const licht = await prisma.category.upsert({
    where: { name: "Licht" },
    update: {},
    create: { name: "Licht" },
  });
  const video = await prisma.category.upsert({
    where: { name: "Video" },
    update: {},
    create: { name: "Video" },
  });
  await prisma.category.upsert({
    where: { name: "Rigging" },
    update: {},
    create: { name: "Rigging" },
  });

  // Geräte (Typen mit Bestand)
  async function upsertDevice(args: {
    name: string;
    manufacturer?: string;
    model?: string;
    categoryId: string;
    stockQuantity: number;
    dailyRate: number;
    replacementValue?: number;
    weight?: number;
    powerWatts?: number;
  }) {
    const existing = await prisma.device.findFirst({
      where: { name: args.name, model: args.model ?? null },
      select: { id: true },
    });
    if (existing) return existing;
    return prisma.device.create({
      data: {
        name: args.name,
        manufacturer: args.manufacturer,
        model: args.model,
        categoryId: args.categoryId,
        stockQuantity: args.stockQuantity,
        dailyRate: args.dailyRate,
        replacementValue: args.replacementValue,
        weight: args.weight,
        powerWatts: args.powerWatts,
      },
      select: { id: true },
    });
  }

  const mixer = await upsertDevice({
    name: "Yamaha QL5",
    manufacturer: "Yamaha",
    model: "QL5",
    categoryId: ton.id,
    stockQuantity: 1,
    dailyRate: 250,
    replacementValue: 8500,
    weight: 16,
    powerWatts: 250,
  });
  const sm58 = await upsertDevice({
    name: "Shure SM58",
    manufacturer: "Shure",
    model: "SM58",
    categoryId: ton.id,
    stockQuantity: 8,
    dailyRate: 8,
    replacementValue: 120,
    weight: 0.3,
  });
  const y10p = await upsertDevice({
    name: "d&b Y10P",
    manufacturer: "d&b",
    model: "Y10P",
    categoryId: ton.id,
    stockQuantity: 4,
    dailyRate: 120,
    replacementValue: 4500,
    weight: 19,
    powerWatts: 700,
  });
  const pointe = await upsertDevice({
    name: "Robe Pointe",
    manufacturer: "Robe",
    model: "Pointe",
    categoryId: licht.id,
    stockQuantity: 8,
    dailyRate: 80,
    replacementValue: 3500,
    weight: 14,
    powerWatts: 470,
  });
  await upsertDevice({
    name: "Panasonic PT-RZ970",
    manufacturer: "Panasonic",
    model: "PT-RZ970",
    categoryId: video.id,
    stockQuantity: 2,
    dailyRate: 350,
    replacementValue: 18000,
    weight: 27,
    powerWatts: 720,
  });

  // Packeinheiten
  const tonCase = await prisma.packUnit.upsert({
    where: { code: "PU-001" },
    update: {},
    create: {
      code: "PU-001",
      name: "FOH-Mixerkoffer",
      description: "Mixer + 2 Handmics",
      categoryId: ton.id,
      locationId: hauptlager.id,
      stockQuantity: 1,
      weight: 25,
    },
  });
  await prisma.packUnitDevice.upsert({
    where: { packUnitId_deviceId: { packUnitId: tonCase.id, deviceId: mixer.id } },
    update: { quantity: 1 },
    create: { packUnitId: tonCase.id, deviceId: mixer.id, quantity: 1 },
  });
  await prisma.packUnitDevice.upsert({
    where: { packUnitId_deviceId: { packUnitId: tonCase.id, deviceId: sm58.id } },
    update: { quantity: 2 },
    create: { packUnitId: tonCase.id, deviceId: sm58.id, quantity: 2 },
  });

  const speakerCase = await prisma.packUnit.upsert({
    where: { code: "PU-002" },
    update: {},
    create: {
      code: "PU-002",
      name: "Doppelcase Lautsprecher",
      description: "2× d&b Y10P pro Case",
      categoryId: ton.id,
      locationId: hauptlager.id,
      stockQuantity: 2,
      weight: 60,
    },
  });
  await prisma.packUnitDevice.upsert({
    where: { packUnitId_deviceId: { packUnitId: speakerCase.id, deviceId: y10p.id } },
    update: { quantity: 2 },
    create: { packUnitId: speakerCase.id, deviceId: y10p.id, quantity: 2 },
  });

  const lightCase = await prisma.packUnit.upsert({
    where: { code: "PU-003" },
    update: {},
    create: {
      code: "PU-003",
      name: "Movinglight-Case (4×)",
      description: "4× Robe Pointe pro Case",
      categoryId: licht.id,
      locationId: hauptlager.id,
      stockQuantity: 2,
      weight: 80,
    },
  });
  await prisma.packUnitDevice.upsert({
    where: { packUnitId_deviceId: { packUnitId: lightCase.id, deviceId: pointe.id } },
    update: { quantity: 4 },
    create: { packUnitId: lightCase.id, deviceId: pointe.id, quantity: 4 },
  });

  // Personal- und Transport-Positionen (Stammdaten)
  const services: Array<{
    name: string;
    kind: ServiceItemKind;
    unit: BillingUnit;
    unitPrice: number;
    description?: string;
  }> = [
    {
      name: "Tagessatz Lichttechniker",
      kind: ServiceItemKind.PERSONAL,
      unit: BillingUnit.DAY,
      unitPrice: 480,
      description: "10-Stunden-Tag inkl. Pausen",
    },
    {
      name: "Tagessatz Tontechniker",
      kind: ServiceItemKind.PERSONAL,
      unit: BillingUnit.DAY,
      unitPrice: 480,
    },
    {
      name: "Lichttechniker nach Stunden",
      kind: ServiceItemKind.PERSONAL,
      unit: BillingUnit.HOUR,
      unitPrice: 55,
    },
    {
      name: "Bühnenhelfer",
      kind: ServiceItemKind.PERSONAL,
      unit: BillingUnit.HOUR,
      unitPrice: 35,
    },
    {
      name: "Transport 7,5t LKW",
      kind: ServiceItemKind.TRANSPORT,
      unit: BillingUnit.FLAT,
      unitPrice: 350,
      description: "An- und Abfahrt im Umkreis 50 km",
    },
    {
      name: "Transport Sprinter",
      kind: ServiceItemKind.TRANSPORT,
      unit: BillingUnit.FLAT,
      unitPrice: 180,
    },
    {
      name: "Stromaggregat 30 kVA",
      kind: ServiceItemKind.SONSTIGES,
      unit: BillingUnit.DAY,
      unitPrice: 120,
    },
  ];
  for (const s of services) {
    await prisma.serviceItem.upsert({
      where: { name: s.name },
      update: {},
      create: s,
    });
  }

  // Beispiel-Kunde
  const customer = await prisma.customer.upsert({
    where: { name: "Musterfirma GmbH" },
    update: {},
    create: {
      name: "Musterfirma GmbH",
      contactPerson: "Frau Beispiel",
      email: "kontakt@musterfirma.de",
      phone: "+49 30 12345678",
      address: "Beispielstraße 1\n12345 Berlin",
    },
  });

  // Beispiel-Projekt
  const now = new Date();
  const inAWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const inTenDays = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

  const proj = await prisma.project.upsert({
    where: { id: "seed-project-1" },
    update: {},
    create: {
      id: "seed-project-1",
      name: "Sommerfest Musterfirma",
      customerId: customer.id,
      description: "Open-Air Sommerfest mit Bühne und Bar",
      status: ProjectStatus.CONFIRMED,
      planningStart: now,
      planningEnd: inTenDays,
      createdById: admin.id,
      billingPeriods: {
        create: [
          {
            start: inAWeek,
            end: new Date(inAWeek.getTime() + 2 * 24 * 60 * 60 * 1000),
            notes: "Veranstaltungstag",
          },
        ],
      },
    },
  });

  // Beispiel-Gruppe pro Projekt
  let tonGroup = await prisma.projectGroup.findFirst({
    where: { projectId: proj.id, kind: ProjectGroupKind.MATERIAL, name: "Ton" },
    select: { id: true },
  });
  if (!tonGroup) {
    tonGroup = await prisma.projectGroup.create({
      data: {
        projectId: proj.id,
        kind: ProjectGroupKind.MATERIAL,
        name: "Ton",
        sortOrder: 0,
      },
      select: { id: true },
    });
  }

  await prisma.projectAssignment.upsert({
    where: { projectId_packUnitId: { projectId: proj.id, packUnitId: tonCase.id } },
    update: {},
    create: {
      projectId: proj.id,
      packUnitId: tonCase.id,
      groupId: tonGroup.id,
      quantity: 1,
    },
  });

  console.log("✓ Seed abgeschlossen");
  console.log(`  Admin Login:    ${adminEmail} / ${adminPassword}`);
  console.log("  Disponent:      disponent@devo.local / disponent123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
