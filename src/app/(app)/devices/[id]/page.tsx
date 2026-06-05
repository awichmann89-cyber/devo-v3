import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";
import { ArrowLeft, Boxes, ShieldOff } from "lucide-react";
import { formatCurrency, formatDate, serialize } from "@/lib/utils";
import { projectStatusVariant } from "@/lib/labels";
import { DeviceDialog } from "../device-dialog";
import { DeviceQr } from "./device-qr";
import { DeleteDeviceButton } from "./delete-button";
import { SerialNumbersSection } from "./serial-numbers-section";

export default async function DeviceDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const [device, categories, locations] = await Promise.all([
    prisma.device.findUnique({
      where: { id },
      include: {
        category: true,
        serialNumbers: {
          orderBy: { createdAt: "asc" },
          include: {
            inspections: { orderBy: { date: "desc" }, take: 1 },
          },
        },
        packUnitItems: {
          include: { packUnit: true },
        },
        assignments: {
          include: { project: true },
          orderBy: { project: { planningStart: "desc" } },
          take: 10,
        },
      },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!device) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/material?tab=devices"><ArrowLeft className="h-4 w-4" /> Zurück</Link>
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{device.name}</h1>
            {device.inspectionExempt && (
              <Badge variant="secondary" className="gap-1">
                <ShieldOff className="h-3 w-3" />
                Prüfung nicht erforderlich
              </Badge>
            )}
          </div>
          {(device.manufacturer || device.model) && (
            <p className="text-sm text-muted-foreground">
              {[device.manufacturer, device.model].filter(Boolean).join(" ")}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <DeviceDialog
            categories={categories}
            device={serialize(device)}
            editTrigger
          />
          <DeleteDeviceButton id={device.id} name={device.name} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Stammdaten</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Field label="Hersteller" value={device.manufacturer} />
              <Field label="Modell" value={device.model} />
              <Field label="Kategorie" value={device.category?.name} />
              <Field label="Lagerbestand" value={`${device.stockQuantity} Stück`} />
              <Field label="Tagespreis (pro Stück)" value={formatCurrency(Number(device.dailyRate))} />
              <Field
                label="Wiederbeschaffung"
                value={device.replacementValue ? formatCurrency(Number(device.replacementValue)) : null}
              />
              <Field label="Gewicht (pro Stück)" value={device.weight ? `${device.weight} kg` : null} />
              <Field label="Leistung (pro Stück)" value={device.powerWatts ? `${device.powerWatts} W` : null} />
              <Field label="DGUV V3 Prüfung" value={device.inspectionExempt ? "Nicht erforderlich" : "Erforderlich"} />
            </dl>
            {device.description && (
              <div className="mt-4 border-t pt-4 text-sm">
                <div className="text-muted-foreground mb-1">Beschreibung</div>
                <p>{device.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">QR-Code</CardTitle></CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <DeviceQr id={device.id} name={device.name} />
            <p className="text-xs text-muted-foreground text-center">
              Scannt zur öffentlichen Geräteübersicht
            </p>
          </CardContent>
        </Card>
      </div>

      <SerialNumbersSection
        deviceId={device.id}
        stockQuantity={device.stockQuantity}
        inspectionExempt={device.inspectionExempt}
        serialNumbers={device.serialNumbers.map((s) => ({
          id: s.id,
          serialNumber: s.serialNumber,
          barcode: s.barcode,
          notes: s.notes,
          lastInspection: s.inspections[0]
            ? {
                date: s.inspections[0].date.toISOString(),
                result: s.inspections[0].result,
              }
            : null,
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Boxes className="h-4 w-4" /> In Packeinheiten
          </CardTitle>
        </CardHeader>
        <CardContent>
          {device.packUnitItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Dieses Gerät ist keiner Packeinheit zugeordnet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Packeinheit</TableHead>
                  <TableHead className="text-right">Stück pro Packeinheit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {device.packUnitItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-sm">
                      <Link href={`/pack-units/${item.packUnit.id}`} className="hover:underline">
                        {item.packUnit.code}
                      </Link>
                    </TableCell>
                    <TableCell>{item.packUnit.name}</TableCell>
                    <TableCell className="text-right">{item.quantity}×</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Boxes className="h-4 w-4" /> Projekt-Buchungen
          </CardTitle>
        </CardHeader>
        <CardContent>
          {device.assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Dieses Gerät ist aktuell in keinem Projekt gebucht.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Projekt</TableHead>
                  <TableHead>Zeitraum</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Anzahl</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {device.assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link href={`/projects/${a.project.id}`} className="hover:underline font-medium">
                        {a.project.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(a.project.planningStart)} – {formatDate(a.project.planningEnd)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={projectStatusVariant(a.project.status)} className="text-[10px]">
                        {a.project.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {a.quantity}×
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
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