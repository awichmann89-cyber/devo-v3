import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Timeline } from "./timeline";
import { CalendarFeedForm } from "./calendar-feed-form";
import { getOrCreateCalendarToken } from "@/lib/settings";

export default async function CalendarPage(props: { searchParams: Promise<{ month?: string }> }) {
  const sp = await props.searchParams;

  const now = new Date();
  let viewStart: Date;
  if (sp.month) {
    const [y, m] = sp.month.split("-").map(Number);
    viewStart = new Date(y, m - 1, 1);
  } else {
    viewStart = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  // Das Monats-Grid zeigt 6 Wochen (42 Tage), beginnend mit dem Montag der
  // Woche, in der der 1. des Monats liegt. Wir laden Projekte, deren Planungs-
  // Zeitraum sich mit diesem 42-Tage-Fenster überschneidet.
  const offsetFromMonday = (viewStart.getDay() + 6) % 7;
  const gridStart = new Date(viewStart);
  gridStart.setDate(viewStart.getDate() - offsetFromMonday);
  gridStart.setHours(0, 0, 0, 0);
  const gridEnd = new Date(gridStart);
  gridEnd.setDate(gridStart.getDate() + 41);
  gridEnd.setHours(23, 59, 59, 999);

  const projects = await prisma.project.findMany({
    where: {
      planningStart: { lte: gridEnd },
      planningEnd: { gte: gridStart },
    },
    include: {
      _count: { select: { assignments: true } },
      customer: { select: { name: true } },
    },
    orderBy: { planningStart: "asc" },
  });

  const calendarToken = await getOrCreateCalendarToken();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Projekt-Kalender</h1>
        <p className="text-muted-foreground">
          Monatsübersicht aller Projekte mit Planungszeitraum
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Timeline
            viewStart={viewStart.toISOString()}
            projects={projects.map((p) => ({
              id: p.id,
              name: p.name,
              customer: p.customer?.name ?? null,
              status: p.status,
              planningStart: p.planningStart.toISOString(),
              planningEnd: p.planningEnd.toISOString(),
              deviceCount: p._count.assignments,
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kalender-Feeds zum Abonnieren</CardTitle>
          <CardDescription>
            ICS-URLs für Google Kalender, Apple Kalender oder Outlook. Zwei
            separate Feeds für Planungs- und Berechnungszeiträume —
            Aktualisierung erfolgt automatisch.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CalendarFeedForm initialToken={calendarToken} />
        </CardContent>
      </Card>
    </div>
  );
}
