import { prisma } from "@/lib/prisma";
import { MaterialView } from "./material-view";
import { DeviceVM } from "./devices-section";
import { CableVM } from "./cables-section";
import { serialize } from "@/lib/utils";

export default async function MaterialPage() {

  const [packUnits, devices, locations, categories, cables] = await Promise.all([
    prisma.packUnit.findMany({
      include: {
        location: true,
        category: true,
        items: { include: { device: { include: { category: true } } } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.device.findMany({
      include: {
        category: true,
        _count: { select: { packUnitItems: true, serialNumbers: true } },
        serialNumbers: {
          include: { _count: { select: { inspections: true } } },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.location.findMany({
      include: { _count: { select: { packUnits: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.cable.findMany({
      include: {
        category: true,
        units: {
          include: { _count: { select: { inspections: true } } },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const devicesVM: DeviceVM[] = devices.map((d) => ({
    id: d.id,
    name: d.name,
    manufacturer: d.manufacturer,
    model: d.model,
    description: d.description,
    stockQuantity: d.stockQuantity,
    dailyRate: Number(d.dailyRate),
    replacementValue: d.replacementValue ? Number(d.replacementValue) : null,
    weight: d.weight ? Number(d.weight) : null,
    powerWatts: d.powerWatts,
    inspectionExempt: d.inspectionExempt,
    showOnDocuments: d.showOnDocuments,
    categoryId: d.categoryId,
    category: d.category,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    serialsTotal: d.serialNumbers.length,
    serialsInspected: d.serialNumbers.filter((s) => s._count.inspections > 0).length,
    _count: d._count,
  }));

  const cablesVM: CableVM[] = cables.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    cableType: c.cableType,
    lengthMeters: c.lengthMeters ? Number(c.lengthMeters) : null,
    connectorA: c.connectorA,
    connectorB: c.connectorB,
    stockQuantity: c.stockQuantity,
    categoryId: c.categoryId,
    categoryName: c.category?.name ?? null,
    inspectionExempt: c.inspectionExempt,
    // Für den Bearbeiten-Dialog: sonst würden diese Werte beim Speichern aus
    // der Liste heraus auf null zurückfallen.
    replacementValue: c.replacementValue ? Number(c.replacementValue) : null,
    weight: c.weight ? Number(c.weight) : null,
    unitsTotal: c.units.length,
    unitsWithBarcode: c.units.filter((u) => u.barcode).length,
    unitsInspected: c.units.filter((u) => u._count.inspections > 0).length,
  }));

  return (
    <MaterialView
      devices={devicesVM}
      packUnits={serialize(packUnits)}
      cables={cablesVM}
      locations={locations}
      categories={categories}
    />
  );
}
