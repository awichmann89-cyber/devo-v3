import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectsTable } from "./projects-table";
import { ProjectDialog } from "./project-dialog";
import { auth } from "@/auth";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDate(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(s);
  if (isNaN(d.getTime())) return fallback;
  return d;
}

export default async function ProjectsPage(props: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await props.searchParams;

  // Default-Zeitraum: laufender Monat + 3 Folgemonate (analog Forecast).
  // Bei Bedarf via URL-Parameter `from` und `to` überschreibbar.
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 3, 0);
  const from = parseDate(sp.from, defaultFrom);
  const to = parseDate(sp.to, defaultTo);
  const fromEnd = new Date(from);
  fromEnd.setHours(0, 0, 0, 0);
  const toEnd = new Date(to);
  toEnd.setHours(23, 59, 59, 999);

  const [projects, customers, users, session] = await Promise.all([
    prisma.project.findMany({
      where: {
        // Server-seitiger Vorfilter nach Planungs-Range — der Status-Filter
        // läuft clientseitig, weil er reine UI-Ergonomie ist.
        planningEnd: { gte: fromEnd },
        planningStart: { lte: toEnd },
      },
      select: {
        id: true,
        name: true,
        status: true,
        kind: true,
        planningStart: true,
        planningEnd: true,
        customer: { select: { name: true } },
        maintainer: { select: { name: true, email: true } },
        billingPeriods: {
          select: { start: true, end: true },
          orderBy: { start: "asc" },
        },
        _count: { select: { assignments: true } },
      },
      orderBy: { planningStart: "asc" },
    }),
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    auth(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <ProjectDialog
          customers={customers}
          users={users}
          currentUserId={session?.user.id ?? null}
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <ProjectsTable
            projects={projects}
            initialFrom={isoDate(from)}
            initialTo={isoDate(to)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
