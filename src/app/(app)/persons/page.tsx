import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Personen
            <InfoHint text="Gesellschafter, Mitarbeiter, Freelancer und Minijobber. Personen werden im Projekt an Personal-Positionen eingeplant und erhalten einen persönlichen Link für Kalender-Abo und Zeiterfassung." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PersonsTable persons={vmPersons} users={users} />
        </CardContent>
      </Card>
    </div>
  );
}
