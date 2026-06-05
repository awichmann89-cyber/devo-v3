import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Hash, ShieldOff } from "lucide-react";
import { CableUnitsEditor, CableUnitVM } from "./cable-units-editor";
import { CableActionsButtons } from "./cable-actions-buttons";
import { QrCodeDisplay } from "@/app/(app)/devices/[id]/qr-display";
import { formatCurrency } from "@/lib/utils";

export default async function CableDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth();
  const { id } = await props.params;

  const [cable, categories] = await Promise.all([
    prisma.cable.findUnique({
      where: { id },
      include: {
        category: true,
        units: {
          orderBy: { createdAt: "asc" },
          include: {
            inspections: { orderBy: { date: "desc" }, take: 1 },
          },
        },
      },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!cable) notFound();

  const unitsVM: CableUnitVM[] = cable.units.map((u) => ({
    id: u.id,
    barcode: u.barcode,
    notes: u.notes,
    lastInspection: u.inspections[0]
      ? {
          date: u.inspections[0].date.toISOString(),
          result: u.inspections[0].result,
        }
      : null,
  }));

  const cableForDialog = {
    id: cable.id,
    name: cable.name,
    cableType: cable.cableType,
    lengthMeters: cable.lengthMeters ? Number(cable.lengthMeters) : null,
    connectorA: cable.connectorA,
    connectorB: cable.connectorB,
    stockQuantity: cable.stockQuantity,
    categoryId: cable.categoryId,
    description: cable.description,
    replacementValue: cable.replacementValue ? Number(cable.replacementValue) : null,
    weight: cable.weight ? Number(cable.weight) : null,
    inspectionExempt: cable.inspectionExempt,
  };

  const withBarcode = unitsVM.filter((u) => u.barcode).length;

  const subtitle = [
    cable.cableType,
    cable.lengthMeters ? `${cable.lengthMeters} m` : null,
    cable.connectorA && cable.connectorB
      ? `${cable.connectorA} → ${cable.connectorB}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/material?tab=cables">
            <ArrowLeft className="h-4 w-4" /> Zurück
          </Link>
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{cable.name}</h1>
            {cable.inspectionExempt && (
              <Badge variant="secondary" className="gap-1">
                <ShieldOff className="h-3 w-3" />
                Prüfung nicht erforderlich
              </Badge>
            )}
          </div>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <CableActionsButtons
          cable={cableForDialog}
          categories={categories}
          unitsTotal={unitsVM.length}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Stammdaten</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Field label="Typ" value={cable.cableType} />
              <Field
                label="Länge"
                value={cable.lengthMeters ? `${cable.lengthMeters} m` : null}
              />
              <Field label="Stecker A" value={cable.connectorA} />
              <Field label="Stecker B" value={cable.connectorB} />
              <Field label="Kategorie" value={cable.category?.name} />
              <Field
                label="Bestand"
                value={`${cable.stockQuantity} Stück`}
              />
              <Field
                label="Wiederbeschaffung"
                value={
                  cable.replacementValue
                    ? formatCurrency(Number(cable.replacementValue))
                    : null
                }
              />
              <Field
                label="Gewicht (pro Stück)"
                value={cable.weight ? `${cable.weight} kg` : null}
              />
              <Field
                label="DGUV V3 Prüfung"
                value={cable.inspectionExempt ? "Nicht erforderlich" : "Erforderlich"}
              />
            </dl>
            {cable.description && (
              <div className="mt-4 border-t pt-4 text-sm">
                <div className="text-muted-foreground mb-1">Beschreibung</div>
                <p className="whitespace-pre-line">{cable.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">QR-Code</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <QrCodeDisplay text={cable.id} label={cable.name} />
            <p className="text-xs text-muted-foreground text-center">
              Scannt direkt zum Kabel
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hash className="h-4 w-4" /> Einzel-Einheiten ({withBarcode} / {unitsVM.length})
          </CardTitle>
          <CardDescription>
            {cable.inspectionExempt
              ? "Für dieses Kabel ist keine DGUV V3 Prüfung erforderlich. Barcodes können optional zur Identifikation gepflegt werden."
              : "Pflege pro Kabel den eindeutigen Barcode für die DGUV V3 Prüfung nach. Beim Verlassen des Feldes wird automatisch gespeichert."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CableUnitsEditor units={unitsVM} />
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value || "—"}</dd>
    </>
  );
}
