import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PersonsTable } from "./persons-table";

export default async function PersonsPage() {
  const persons = await prisma.person.findMany({
    include: { _count: { select: { assignments: true, timeEntries: true } } },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

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
    _count: p._count,
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Personen</CardTitle>
          <CardDescription>
            Gesellschafter, Mitarbeiter, Freelancer und Minijobber. Personen
            werden im Projekt an Personal-Positionen eingeplant und erhalten
            einen persönlichen Link für Kalender-Abo und Zeiterfassung.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PersonsTable persons={vmPersons} />
        </CardContent>
      </Card>
    </div>
  );
}
