import { prisma } from "@/lib/prisma";
import { PersonsTable } from "./persons-table";
import { conflictsByBooking, loadPersonBookings } from "@/lib/booking-load";

export default async function PersonsPage() {
  const [persons, users] = await Promise.all([
    prisma.person.findMany({
      include: {
        _count: {
          select: {
            assignments: true,
            timeEntries: true,
            drivenAssignments: true,
          },
        },
        user: { select: { name: true, email: true } },
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Überbuchungen je Person: Einsätze, die sich mit einem anderen Projekt
  // überschneiden oder am selben Tag liegen (lib/booking-conflicts.ts).
  const bookings = await loadPersonBookings(persons.map((p) => p.id));
  const conflicts = conflictsByBooking(bookings);
  const conflictCounts = new Map<string, number>();
  for (const b of bookings) {
    if (!conflicts[b.id]) continue;
    conflictCounts.set(b.resourceId, (conflictCounts.get(b.resourceId) ?? 0) + 1);
  }

  const vmPersons = persons.map((p) => ({
    id: p.id,
    name: p.name,
    employmentType: p.employmentType,
    email: p.email,
    phone: p.phone,
    address: p.address,
    notes: p.notes,
    active: p.active,
    hourlyWage: p.hourlyWage != null ? Number(p.hourlyWage) : null,
    defaultDayRate: p.defaultDayRate != null ? Number(p.defaultDayRate) : null,
    userId: p.userId,
    userLabel: p.user ? (p.user.name ?? p.user.email) : null,
    conflictCount: conflictCounts.get(p.id) ?? 0,
    _count: p._count,
  }));

  return <PersonsTable persons={vmPersons} users={users} />;
}
