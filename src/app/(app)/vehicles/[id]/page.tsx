import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import { Badge } from "@/components/ui/badge";
import { StatTile, StatTileGrid } from "@/components/ui/stat-tile";
import { DetailHeader } from "@/components/layout/detail-header";
import { AlertTriangle, CalendarClock, Truck, UserRound } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  conflictSeverityHint,
  conflictSeverityLabel,
  conflictSeverityVariant,
  projectStatusLabel,
  projectStatusVariant,
  vehicleKindLabel,
  vehicleKindVariant,
} from "@/lib/labels";
import { maxSeverity } from "@/lib/booking-conflicts";
import { conflictsByBooking, loadVehicleBookings } from "@/lib/booking-load";
import { VehicleEditButton } from "./vehicle-edit-button";

export default async function VehicleDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const vehicle = await prisma.vehicle.findUnique({ where: { id } });
  if (!vehicle) notFound();

  // Alle Einsätze dieser Einheit — daraus Belegungsplan und Konflikte.
  const bookings = await loadVehicleBookings([id]);
  const conflicts = conflictsByBooking(bookings);

  const now = new Date();
  const sorted = [...bookings].sort((a, b) => +b.start - +a.start);
  const upcoming = bookings.filter((b) => b.end >= now).length;
  const conflictCount = bookings.filter((b) => conflicts[b.id]).length;

  const vehicleVM = {
    id: vehicle.id,
    name: vehicle.name,
    kind: vehicle.kind,
    licensePlate: vehicle.licensePlate,
    loadCapacityKg: vehicle.loadCapacityKg,
    grossWeightKg: vehicle.grossWeightKg,
    requiredLicense: vehicle.requiredLicense,
    nextInspection: vehicle.nextInspection
      ? vehicle.nextInspection.toISOString()
      : null,
    notes: vehicle.notes,
    active: vehicle.active,
  };

  const kg = (value: number | null) =>
    value != null ? `${value.toLocaleString("de-DE")} kg` : "—";

  return (
    <div className="space-y-4">
      <DetailHeader
        backHref="/vehicles"
        title={vehicle.name}
        badges={
          <>
            <Badge variant={vehicleKindVariant(vehicle.kind)}>
              {vehicleKindLabel(vehicle.kind)}
            </Badge>
            {!vehicle.active && <Badge variant="outline">Inaktiv</Badge>}
            {conflictCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {conflictCount} Konflikt{conflictCount === 1 ? "" : "e"}
              </Badge>
            )}
          </>
        }
        subtitle={vehicle.licensePlate ?? undefined}
        actions={<VehicleEditButton vehicle={vehicleVM} />}
      />

      <StatTileGrid>
        <StatTile label="Einsätze" value={bookings.length} icon={Truck} />
        <StatTile
          label="Kommende Einsätze"
          value={upcoming}
          tone="info"
          icon={CalendarClock}
        />
        <StatTile
          label="Konflikte"
          value={conflictCount}
          tone={conflictCount > 0 ? "destructive" : "muted"}
          icon={AlertTriangle}
          hint="Überschneidungen oder gleicher Tag in anderen Projekten"
        />
      </StatTileGrid>

      <Card>
        <CardHeader>
          <CardTitle>Stammdaten</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <dl className="grid grid-cols-[180px_1fr] gap-y-1.5">
            <dt className="text-muted-foreground">Kennzeichen</dt>
            <dd className="num">{vehicle.licensePlate ?? "—"}</dd>
            <dt className="text-muted-foreground">Zuladung</dt>
            <dd className="num">{kg(vehicle.loadCapacityKg)}</dd>
            <dt className="text-muted-foreground">Zul. Gesamtgewicht</dt>
            <dd className="num">{kg(vehicle.grossWeightKg)}</dd>
            <dt className="text-muted-foreground">Führerscheinklasse</dt>
            <dd>{vehicle.requiredLicense ?? "—"}</dd>
            <dt className="text-muted-foreground">HU/TÜV fällig</dt>
            <dd>
              {vehicle.nextInspection ? formatDate(vehicle.nextInspection) : "—"}
            </dd>
          </dl>
          {vehicle.notes && (
            <p className="whitespace-pre-line border-t pt-2 text-muted-foreground">
              {vehicle.notes}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" /> Belegung
            <InfoHint text="Alle Einsätze dieser Einheit. Geplant wird im Projekt (Tab Personal & Transport). Ohne eigene Uhrzeiten blockt ein Einsatz den gesamten Planungszeitraum des Projekts." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Einsätze geplant.
            </p>
          ) : (
            <ul className="divide-y">
              {sorted.map((b) => {
                const hits = conflicts[b.id] ?? [];
                const severity = maxSeverity(hits);
                return (
                  <li
                    key={b.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
                  >
                    <Link
                      href={`/projects/${b.projectId}`}
                      className="font-medium hover:underline"
                    >
                      {b.projectName}
                    </Link>
                    <Badge variant={projectStatusVariant(b.projectStatus)}>
                      {projectStatusLabel(b.projectStatus)}
                    </Badge>
                    <span className="text-muted-foreground">{b.serviceName}</span>
                    <span className="text-xs text-muted-foreground">
                      {b.timed
                        ? `${formatDateTime(b.start)} – ${formatDateTime(b.end)}`
                        : `ganztägig, ${formatDate(b.start)} – ${formatDate(
                            new Date(+b.end - 86400000)
                          )}`}
                    </span>
                    {b.driverName && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <UserRound className="h-3 w-3" /> {b.driverName}
                      </span>
                    )}
                    {b.end >= now && <Badge variant="secondary">geplant</Badge>}
                    {severity && (
                      <Badge
                        variant={conflictSeverityVariant(severity)}
                        className="ml-auto gap-1"
                        title={`${conflictSeverityHint(severity, "Einheit")}: ${hits
                          .map((h) => h.projectName)
                          .join(", ")}`}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {conflictSeverityLabel(severity)}
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
