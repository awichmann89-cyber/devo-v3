import { prisma } from "@/lib/prisma";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Boxes, Package, MapPin } from "lucide-react";
import { PackUnitsSection } from "./pack-units-section";
import { DevicesSection } from "./devices-section";
import { LocationsSection } from "./locations-section";
import { serialize } from "@/lib/utils";

interface SearchParams {
  tab?: string;
}

export default async function MaterialPage(props: { searchParams: Promise<SearchParams> }) {
  const sp = await props.searchParams;
  const tab = sp.tab ?? "pack-units";

  const [packUnits, devices, locations, categories] = await Promise.all([
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
      },
      orderBy: { name: "asc" },
    }),
    prisma.location.findMany({
      include: { _count: { select: { packUnits: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Material</h1>
        <p className="text-muted-foreground">Packeinheiten, Geräte und Lagerorte</p>
      </div>

      <Tabs defaultValue={tab}>
        <TabsList>
          <TabsTrigger value="pack-units">
            <Boxes className="h-4 w-4" /> Packeinheiten ({packUnits.length})
          </TabsTrigger>
          <TabsTrigger value="devices">
            <Package className="h-4 w-4" /> Geräte ({devices.length})
          </TabsTrigger>
          <TabsTrigger value="locations">
            <MapPin className="h-4 w-4" /> Lagerorte ({locations.length})
          </TabsTrigger>
        </TabsList>

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

        <TabsContent value="devices">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{devices.length} Geräte-Typen</CardTitle>
            </CardHeader>
            <CardContent>
              <DevicesSection
                devices={serialize(devices)}
                categories={categories}
                locations={locations}
              />
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
