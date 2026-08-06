import { prisma } from "@/lib/prisma";
import { PersonsTable } from "./persons-table";

export default async function PersonsPage() {
  const [persons, users] = await Promise.all([
    prisma.person.findMany({
      include: {
        _count: { select: { assignments: true, timeEntries: true } },
        user: { select: { name: true, email: true } },
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

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
    _count: p._count,
  }));

  return <PersonsTable persons={vmPersons} users={users} />;
}
