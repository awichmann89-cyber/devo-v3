import {
  PrismaClient,
  Role,
  ServiceItemKind,
  BillingUnit,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // ---------- Admin-User (Pflicht — wird auf Vercel via ENV-Vars gesetzt) ----------
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@cratel.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin123";

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  // Admin wird IMMER aus den .env-Werten synchronisiert — wenn du
  // SEED_ADMIN_PASSWORD in der .env änderst und `prisma db seed` läufst,
  // wird das neue Passwort übernommen.
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

  // ---------- Demo-Disponent ----------
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

  // ---------- Lagerorte (Stammdaten — idempotent) ----------
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

  // ---------- Kategorien (Stammdaten — idempotent) ----------
  await prisma.category.upsert({
    where: { name: "Ton" },
    update: {},
    create: { name: "Ton" },
  });
  await prisma.category.upsert({
    where: { name: "Licht" },
    update: {},
    create: { name: "Licht" },
  });
  await prisma.category.upsert({
    where: { name: "Video" },
    update: {},
    create: { name: "Video" },
  });
  await prisma.category.upsert({
    where: { name: "Rigging" },
    update: {},
    create: { name: "Rigging" },
  });

  // ---------- Personal- und Transport-Positionen (Stammdaten) ----------
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

  // HINWEIS: Demo-Geräte, -Packeinheiten und -Projekt werden bewusst NICHT mehr
  // beim Deploy angelegt. Wer Beispieldaten will, kann sie über das UI anlegen
  // oder die alten Seed-Blöcke aus der git-Historie wieder einbauen.

  console.log("✓ Seed abgeschlossen");
  console.log(`  Admin Login:    ${adminEmail} / ${adminPassword}`);
  console.log("  Disponent:      disponent@cratel.local / disponent123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
