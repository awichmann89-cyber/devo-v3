import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Boxes, Package, MapPin, Cable as CableIcon, ScanLine } from "lucide-react";
import { PackUnitsSection } from "./pack-units-section";
import { DevicesSection, DeviceVM } from "./devices-section";
import { LocationsSection } from "./locations-section";
import { CablesSection, CableVM } from "./cables-section";
import { serialize } from "@/lib/utils";

interface SearchParams {
  tab?: string;
}

export default async function MaterialPage(props: { searchParams: Promise<SearchParams> }) {
  const sp = await props.searchParams;
  const tab = sp.tab ?? "devices";

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
    unitsTotal: c.units.length,
    unitsWithBarcode: c.units.filter((u) => u.barcode).length,
    unitsInspected: c.units.filter((u) => u._count.inspections > 0).length,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-end gap-4">
        <Button variant="outline" asChild>
          <Link href="/material/inspection">
            <ScanLine className="h-4 w-4" /> Prüfungsmodus
          </Link>
        </Button>
      </div>

      <Tabs defaultValue={tab}>
        <TabsList>
          <TabsTrigger value="devices">
            <Package className="h-4 w-4" /> Geräte ({devices.length})
          </TabsTrigger>
          <TabsTrigger value="pack-units">
            <Boxes className="h-4 w-4" /> Packeinheiten ({packUnits.length})
          </TabsTrigger>
          <TabsTrigger value="cables">
            <CableIcon className="h-4 w-4" /> Kabel ({cables.length})
          </TabsTrigger>
          <TabsTrigger value="locations">
            <MapPin className="h-4 w-4" /> Lagerorte ({locations.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="devices">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{devices.length} Geräte-Typen</CardTitle>
            </CardHeader>
            <CardContent>
              <DevicesSection
                devices={devicesVM}
                categories={categories}
                locations={locations}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pack-units">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{packUnits.length} Packeinheiten</CardTitle>
            </CardHeader>
            <CardContent>
              <PackUnitsSection
                packUnits={serialize(packUnits)}
                categories={categories}
                locations={locations}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cables">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{cables.length} Kabel-Typen</CardTitle>
            </CardHeader>
            <CardContent>
              <CablesSection cables={cablesVM} categories={categories} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="locations">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{locations.length} Lagerorte</CardTitle>
            </CardHeader>
            <CardContent>
              <LocationsSection locations={locations} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
