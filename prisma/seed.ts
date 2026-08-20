import {
  PrismaClient,
  Role,
  ServiceItemKind,
  BillingUnit,
  VehicleKind,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Seed-Skript. Läuft bei JEDEM Deploy mit (siehe `build` in der package.json),
 * muss also idempotent sein und darf bestehende Kundendaten nicht anfassen.
 *
 * Steuerung über Env-Vars:
 *   * SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD — initialer Admin-Account.
 *     In Produktion Pflicht; ohne die Werte bricht der Seed ab, statt einen
 *     Account mit Default-Passwort anzulegen.
 *   * SEED_ADMIN_FORCE_PASSWORD=true — setzt das Passwort eines bereits
 *     existierenden Admins auf SEED_ADMIN_PASSWORD zurück (Notnagel bei
 *     ausgesperrtem Kunden). Standard: bestehender Admin bleibt unangetastet.
 *   * SEED_DEMO_DATA=true — legt Demo-Stammdaten an (Disponent-Account,
 *     Beispiel-Lagerorte, -Kategorien und -Positionen mit Beispielpreisen).
 *     Standard: aus. Eine frische Kundeninstanz startet leer.
 */

/** Auf Vercel und in jedem Production-Build gelten die strengeren Regeln. */
const isProduction =
  process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

const seedDemoData = process.env.SEED_DEMO_DATA === "true";
const forceAdminPassword = process.env.SEED_ADMIN_FORCE_PASSWORD === "true";

async function main() {
  await seedAdmin();

  if (!seedDemoData) {
    console.log("✓ Seed abgeschlossen (ohne Demo-Daten)");
    console.log("  Beispiel-Stammdaten bei Bedarf mit SEED_DEMO_DATA=true.");
    return;
  }

  await seedDemoUsers();
  await seedDemoBaseData();
  await seedDemoServiceItems();
  await seedDemoVehicles();

  console.log("✓ Seed abgeschlossen (inkl. Demo-Daten)");
  console.log("  Disponent: disponent@cratel.local / disponent123");
}

// ---------- Admin-User ----------

async function seedAdmin() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@cratel.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  const existing = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true },
  });

  // Der Normalfall bei jedem Deploy einer laufenden Instanz: Admin ist da,
  // also nichts tun. Ein vom Kunden geändertes Passwort bleibt erhalten.
  if (existing && !forceAdminPassword) {
    console.log(`✓ Admin ${adminEmail} existiert bereits — unverändert.`);
    return;
  }

  if (!adminPassword && isProduction) {
    throw new Error(
      `SEED_ADMIN_PASSWORD ist nicht gesetzt.\n` +
        `Eine Produktions-Instanz darf nicht mit einem Default-Passwort ` +
        `starten. Setze SEED_ADMIN_EMAIL und SEED_ADMIN_PASSWORD in den ` +
        `Environment-Variablen des Projekts und deploye erneut.`,
    );
  }

  const password = adminPassword ?? "admin123";
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash, role: Role.ADMIN },
    create: {
      email: adminEmail,
      name: "Admin",
      passwordHash,
      role: Role.ADMIN,
    },
  });

  console.log(
    existing
      ? `✓ Admin-Passwort für ${adminEmail} zurückgesetzt (SEED_ADMIN_FORCE_PASSWORD).`
      : `✓ Admin ${adminEmail} angelegt.`,
  );
  // Klartext-Passwort niemals in die Vercel-Build-Logs schreiben.
  if (!isProduction) {
    console.log(`  Passwort: ${password}`);
  }
}

// ---------- Demo-Daten (nur mit SEED_DEMO_DATA=true) ----------

async function seedDemoUsers() {
  const disponentHash = await bcrypt.hash("disponent123", 10);
  await prisma.user.upsert({
    where: { email: "disponent@cratel.local" },
    update: {},
    create: {
      email: "disponent@cratel.local",
      name: "Max Disponent",
      passwordHash: disponentHash,
      role: Role.DISPONENT,
    },
  });
}

async function seedDemoBaseData() {
  // ---------- Lagerorte ----------
  await prisma.location.upsert({
    where: { name: "Hauptlager" },
    update: {},
    create: { name: "Hauptlager", description: "Zentrales Lager" },
  });
  await prisma.location.upsert({
    where: { name: "Außenlager" },
    update: {},
    create: { name: "Außenlager", description: "Zweitlager" },
  });

  // ---------- Kategorien ----------
  for (const name of ["Ton", "Licht", "Video", "Rigging"]) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
}

async function seedDemoServiceItems() {
  // Personal- und Transport-Positionen. Die Preise sind Beispielwerte und
  // gehören deshalb hinter SEED_DEMO_DATA — jeder Betrieb kalkuliert anders.
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
}

async function seedDemoVehicles() {
  // Fuhrpark-Beispiele passend zu den Transport-Positionen oben. Fahrzeuge
  // werden im Projekt an Transport-Positionen eingeplant und dort für den
  // Planungszeitraum geblockt.
  const vehicles: Array<{
    name: string;
    kind: VehicleKind;
    licensePlate?: string;
    loadCapacityKg?: number;
    grossWeightKg?: number;
    requiredLicense?: string;
    notes?: string;
  }> = [
    {
      name: "LKW 7,5t",
      kind: VehicleKind.FAHRZEUG,
      licensePlate: "HH-CR 750",
      loadCapacityKg: 3200,
      grossWeightKg: 7490,
      requiredLicense: "C1",
      notes: "Ladebordwand, Ladefläche 6,10 m",
    },
    {
      name: "Sprinter groß",
      kind: VehicleKind.FAHRZEUG,
      licensePlate: "HH-CR 350",
      loadCapacityKg: 1200,
      grossWeightKg: 3500,
      requiredLicense: "B",
    },
    {
      name: "Anhänger 2t",
      kind: VehicleKind.ANHAENGER,
      licensePlate: "HH-CR 200",
      loadCapacityKg: 1600,
      grossWeightKg: 2000,
      requiredLicense: "BE",
    },
  ];

  for (const v of vehicles) {
    await prisma.vehicle.upsert({
      where: { name: v.name },
      update: {},
      create: v,
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
