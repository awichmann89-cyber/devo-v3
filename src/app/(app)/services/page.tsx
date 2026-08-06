import { prisma } from "@/lib/prisma";
import { ServicesTable } from "./services-table";

export default async function ServicesPage() {
  const items = await prisma.serviceItem.findMany({
    include: { _count: { select: { projectServices: true } } },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });

  const vmItems = items.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    kind: s.kind,
    unit: s.unit,
    unitPrice: Number(s.unitPrice),
    active: s.active,
    _count: s._count,
  }));

  return <ServicesTable items={vmItems} />;
}
