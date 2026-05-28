import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Timeline } from "./timeline";
import { ProjectStatus } from "@prisma/client";

export default async function CalendarPage(props: { searchParams: Promise<{ month?: string }> }) {
  const sp = await props.searchParams;

  // Standard: aktueller Monat
  const now = new Date();
  let viewStart: Date;
  if (sp.month) {
    const [y, m] = sp.month.split("-").map(Number);
    viewStart = new Date(y, m - 1, 1);
  } else {
    viewStart = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const viewEnd = new Date(viewStart.getFullYear(), viewStart.getMonth() + 2, 0); // 2 Monate Range

  const projects = await prisma.project.findMany({
    where: {
      planningStart: { lte: viewEnd },
      planningEnd: { gte: viewStart },
    },
    include: {
      _count: { select: { assignments: true } },
    },
    orderBy: { planningStart: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Projekt-Kalender</h1>
        <p className="text-muted-foreground">Übersicht über alle Projekte im Zeitraum</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {viewStart.toLocaleDateString("de-DE", { month: "long", year: "numeric" })} –{" "}
            {viewEnd.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Timeline
            viewStart={viewStart.toISOString()}
            viewEnd={viewEnd.toISOString()}
            projects={projects.map((p) => ({
              id: p.id,
              name: p.name,
              customer: p.customer,
              status: p.status,
              planningStart: p.planningStart.toISOString(),
              planningEnd: p.planningEnd.toISOString(),
              billingStart: p.billingStart.toISOString(),
              billingEnd: p.billingEnd.toISOString(),
              deviceCount: p._count.assignments,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
