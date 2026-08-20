import { prisma } from "@/lib/prisma";
import { VehiclesTable } from "./vehicles-table";
import { conflictsByBooking, loadVehicleBookings } from "@/lib/booking-load";

export default async function VehiclesPage() {
  const [vehicles, bookings] = await Promise.all([
    prisma.vehicle.findMany({
      include: { _count: { select: { assignments: true } } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    // Alle Einsätze aller Einheiten — daraus die Konflikt-Zähler je Zeile.
    loadVehicleBookings(null),
  ]);

  const conflicts = conflictsByBooking(bookings);
  const conflictCounts = new Map<string, number>();
  for (const b of bookings) {
    if (!conflicts[b.id]) continue;
    conflictCounts.set(b.resourceId, (conflictCounts.get(b.resourceId) ?? 0) + 1);
  }

  const vmVehicles = vehicles.map((v) => ({
    id: v.id,
    name: v.name,
    kind: v.kind,
    licensePlate: v.licensePlate,
    loadCapacityKg: v.loadCapacityKg,
    grossWeightKg: v.grossWeightKg,
    requiredLicense: v.requiredLicense,
    nextInspection: v.nextInspection ? v.nextInspection.toISOString() : null,
    notes: v.notes,
    active: v.active,
    assignmentCount: v._count.assignments,
    conflictCount: conflictCounts.get(v.id) ?? 0,
  }));

  return <VehiclesTable vehicles={vmVehicles} />;
}
