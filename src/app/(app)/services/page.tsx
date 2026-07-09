import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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

  return (
    <div className="space-y-6">

      <Card>
        <CardHeader>
          <CardTitle>Positionen</CardTitle>
          <CardDescription>
            Positionen mit Preis und Einheit (Stunde, Tag, Pauschale, Stück).
            Sie können im Projekt mehrfach mit eigener Menge und optionalem
            Preis-Override gebucht werden.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ServicesTable items={vmItems} />
        </CardContent>
      </Card>
    </div>
  );
}
