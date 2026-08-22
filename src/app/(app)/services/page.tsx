import { prisma } from "@/lib/prisma";
import { ServicesTable } from "./services-table";

export default async function ServicesPage() {
  const [items, vehicles] = await Promise.all([
    prisma.serviceItem.findMany({
      include: { _count: { select: { projectServices: true } } },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    }),
    // Aktive Fuhrpark-Einheiten für die Vorbelegung von Transport-Positionen
    prisma.vehicle.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        kind: true,
        licensePlate: true,
        requiredLicense: true,
      },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    }),
  ]);

  const vmItems = items.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    kind: s.kind,
    unit: s.unit,
    unitPrice: Number(s.unitPrice),
    active: s.active,
    defaultVehicleId: s.defaultVehicleId,
    _count: s._count,
  }));

  return <ServicesTable items={vmItems} vehicles={vehicles} />;
}
