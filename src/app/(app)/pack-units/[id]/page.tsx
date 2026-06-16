import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, Package } from "lucide-react";
import { formatCurrency, serialize } from "@/lib/utils";
import { ItemsManager } from "./items-manager";
import { DeletePackUnitButton } from "./delete-button";
import { EditPackUnitButton } from "./edit-button";
import { PackUnitQr } from "./pack-unit-qr";

export default async function PackUnitDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const [packUnit, allDevices, allCables, locations, categories] = await Promise.all([
    prisma.packUnit.findUnique({
      where: { id },
      include: {
        location: true,
        category: true,
        items: {
          include: { device: { include: { category: true } } },
          orderBy: { device: { name: "asc" } },
        },
        cableItems: {
          include: { cable: { include: { category: true } } },
          orderBy: { cable: { name: "asc" } },
        },
      },
    }),
    prisma.device.findMany({
      include: { category: true },
      orderBy: { name: "asc" },
    }),
    prisma.cable.findMany({
      include: { category: true },
      orderBy: { name: "asc" },
    }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!packUnit) notFound();

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

  // Analog für Kabel: Σ PU.stock × cableItem.qty pro Kabel über alle PackUnits
  const cablesWithAllocation = await prisma.cable.findMany({
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
  const allocationByCableId: Record<string, { total: number; stock: number }> = {};
  for (const c of cablesWithAllocation) {
    const total = c.packUnitItems.reduce(
      (s, pi) => s + pi.quantity * (pi.packUnit.stockQuantity ?? 1),
      0
    );
    allocationByCableId[c.id] = { total, stock: c.stockQuantity };
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
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{packUnit.name}</h1>
            <Badge variant={packUnit.packMode === "VARIABLE" ? "outline" : "secondary"}>
              {packUnit.packMode === "VARIABLE" ? "Variabel" : "Fix"}
            </Badge>
          </div>
          {packUnit.category?.name && (
            <p className="text-sm text-muted-foreground">
              {packUnit.category.name}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <EditPackUnitButton
            packUnit={serialize(packUnit)}
            locations={locations}
            categories={categories}
          />
          <DeletePackUnitButton id={packUnit.id} name={packUnit.name} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Stammdaten</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Field label="Kategorie" value={packUnit.category?.name} />
              <Field label="Lagerort" value={packUnit.location?.name} />
              <Field label="Lagerbestand" value={`${stock} Stück`} />
              <Field label="Pack-Modus" value={packUnit.packMode === "VARIABLE" ? "Variabel (Inhalt teilbar)" : "Fix (Case immer ganz)"} />
              <Field label="Geräte pro Einheit" value={`${devicesPerUnit} Stück`} />
              <Field label="Tagespreis (pro Stück)" value={formatCurrency(dailyRatePerUnit)} />
              <Field label="Gewicht (pro Stück)" value={weightPerUnit > 0 ? `${weightPerUnit.toFixed(1)} kg` : null} />
            </dl>
            {packUnit.description && (
              <div className="mt-4 border-t pt-4 text-sm">
                <div className="text-muted-foreground mb-1">Beschreibung</div>
                <p>{packUnit.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">QR-Code</CardTitle></CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <PackUnitQr shortId={packUnit.shortId} name={packUnit.name} />
            <p className="text-xs text-muted-foreground text-center">
              Scannt zur öffentlichen Inhaltsübersicht
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-4 w-4" /> Inhalt
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ItemsManager
            packUnitId={packUnit.id}
            stockQuantity={stock}
            items={serialize(packUnit.items)}
            cableItems={serialize(packUnit.cableItems)}
            allDevices={serialize(allDevices)}
            allCables={serialize(allCables)}
            allocationByDeviceId={allocationByDeviceId}
            allocationByCableId={allocationByCableId}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value || "—"}</dd>
    </>
  );
}
