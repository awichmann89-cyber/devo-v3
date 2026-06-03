import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { ArrowLeft, FileText, Package, QrCode } from "lucide-react";
import { formatCurrency, serialize } from "@/lib/utils";
import { PackUnitForm } from "../pack-unit-form";
import { ItemsManager } from "./items-manager";
import { DeletePackUnitButton } from "./delete-button";
import { StockEditor } from "./stock-editor";
import { PackUnitQr } from "./pack-unit-qr";

export default async function PackUnitDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const [packUnit, allDevices, locations, categories] = await Promise.all([
    prisma.packUnit.findUnique({
      where: { id },
      include: {
        location: true,
        category: true,
        items: {
          include: { device: { include: { category: true } } },
          orderBy: { device: { name: "asc" } },
        },
      },
    }),
    prisma.device.findMany({
      include: { category: true },
      orderBy: { name: "asc" },
    }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!packUnit) notFound();

  // Für jedes Gerät im Lager: Gesamt-Allokation über alle Packeinheiten berechnen.
  // Demand pro Gerät = Σ (packUnit.stockQuantity × item.quantity) über alle Vorkommen.
  const devicesWithAllocation = await prisma.device.findMany({
    select: {
      id: true,
      stockQuantity: true,
      packUnitItems: {
        select: {
          quantity: true,
          packUnit: { select: { stockQuantity: true } },
        },
      },
    },
  });
  const allocationByDeviceId: Record<string, { total: number; stock: number }> = {};
  for (const d of devicesWithAllocation) {
    const total = d.packUnitItems.reduce(
      (s, pi) => s + pi.quantity * (pi.packUnit.stockQuantity ?? 1),
      0
    );
    allocationByDeviceId[d.id] = { total, stock: d.stockQuantity };
  }

  const stock = packUnit.stockQuantity ?? 1;
  const devicesPerUnit = packUnit.items.reduce((s, it) => s + it.quantity, 0);
  const dailyRatePerUnit = packUnit.items.reduce(
    (s, it) => s + Number(it.device.dailyRate) * it.quantity,
    0
  );
  const weightPerUnit =
    Number(packUnit.weight ?? 0) +
    packUnit.items.reduce(
      (s, it) => s + Number(it.device.weight ?? 0) * it.quantity,
      0
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/material?tab=pack-units">
            <ArrowLeft className="h-4 w-4" /> Zurück
          </Link>
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{packUnit.name}</h1>
            {packUnit.isSingleItem && (
              <Badge variant="secondary">Einzelpackeinheit</Badge>
            )}
          </div>
          <p className="text-muted-foreground">{packUnit.description ?? "Keine Beschreibung"}</p>
        </div>
        <DeletePackUnitButton id={packUnit.id} name={packUnit.name} />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-normal text-muted-foreground">Lagerort</CardTitle></CardHeader>
          <CardContent>{packUnit.location?.name ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-normal text-muted-foreground">Lagerbestand</CardTitle></CardHeader>
          <CardContent>
            <StockEditor
              packUnitId={packUnit.id}
              stockQuantity={stock}
              devicesPerUnit={devicesPerUnit}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-normal text-muted-foreground">Tagespreis (pro Stück)</CardTitle></CardHeader>
          <CardContent>{formatCurrency(dailyRatePerUnit)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-normal text-muted-foreground">Gewicht (pro Stück)</CardTitle></CardHeader>
          <CardContent>{weightPerUnit > 0 ? `${weightPerUnit.toFixed(1)} kg` : "—"}</CardContent>
        </Card>
      </div>

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">
            <Package className="h-4 w-4" /> Inhalt ({packUnit.items.length} Geräte-Typen)
          </TabsTrigger>
          <TabsTrigger value="details">
            <FileText className="h-4 w-4" /> Stammdaten
          </TabsTrigger>
          <TabsTrigger value="qr">
            <QrCode className="h-4 w-4" /> QR-Code
          </TabsTrigger>
        </TabsList>

        <TabsContent value="items">
          <ItemsManager
            packUnitId={packUnit.id}
            stockQuantity={stock}
            items={serialize(packUnit.items)}
            allDevices={serialize(allDevices)}
            allocationByDeviceId={allocationByDeviceId}
            isSingleItem={packUnit.isSingleItem}
          />
        </TabsContent>

        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle>Packeinheit bearbeiten</CardTitle>
            </CardHeader>
            <CardContent>
              <PackUnitForm
                packUnit={serialize(packUnit)}
                locations={locations}
                categories={categories}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="qr">
          <Card>
            <CardHeader>
              <CardTitle>QR-Code zum Aufkleben</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3">
              <p className="max-w-md text-center text-sm text-muted-foreground">
                Klebe diesen QR-Code auf das Case. Wer ihn scannt, sieht ohne Login Inhalt und Eigentümer dieser Packeinheit.
              </p>
              <PackUnitQr id={packUnit.id} name={packUnit.name} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
