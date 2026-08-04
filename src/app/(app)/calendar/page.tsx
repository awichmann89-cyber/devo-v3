import { prisma } from "@/lib/prisma";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarClock } from "lucide-react";
import { Timeline } from "./timeline";
import { CalendarFeedForm } from "./calendar-feed-form";
import { getOrCreateCalendarToken } from "@/lib/settings";
import { auth } from "@/auth";
import { formatDate, formatDateTime } from "@/lib/utils";
import { projectStatusLabel, projectStatusVariant } from "@/lib/labels";

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

  // Mit dem eingeloggten Account verknüpfte Person (Personalstamm) — speist
  // die "Meine Einsätze"-Card und das persönliche Personalplanungs-Abo.
  const session = await auth();
  const linkedPerson = session?.user.id
    ? await prisma.person.findFirst({
        where: { userId: session.user.id, active: true },
        select: { id: true, name: true, personalToken: true },
      })
    : null;

  // Token lazy anlegen (Muster Personen-Detailseite) — das Abo soll direkt
  // beim ersten Besuch der Kalender-Seite funktionieren.
  let personalToken = linkedPerson?.personalToken ?? null;
  if (linkedPerson && !personalToken) {
    personalToken = crypto.randomUUID().replace(/-/g, "");
    await prisma.person.update({
      where: { id: linkedPerson.id },
      data: { personalToken },
    });
  }

  const myAssignments = linkedPerson
    ? await prisma.personAssignment.findMany({
        where: { personId: linkedPerson.id },
        include: {
          projectService: {
            select: { serviceItem: { select: { name: true } } },
          },
          billingPeriod: { select: { start: true, end: true } },
          project: {
            select: {
              id: true,
              name: true,
              status: true,
              planningStart: true,
              planningEnd: true,
            },
          },
        },
      })
    : [];
  // Nur anstehende Einsätze, nach effektivem Start sortiert. Fallback-Kette:
  // Uhrzeiten → gewählter Berechnungszeitraum → Planungszeitraum.
  const upcoming = myAssignments
    .map((a) => ({
      id: a.id,
      projectId: a.project.id,
      projectName: a.project.name,
      status: a.project.status,
      serviceName: a.projectService.serviceItem.name,
      start: a.plannedStart ?? a.billingPeriod?.start ?? a.project.planningStart,
      end: a.plannedEnd ?? a.billingPeriod?.end ?? a.project.planningEnd,
      timed: a.plannedStart !== null,
      notes: a.notes,
    }))
    .filter((a) => a.end >= now)
    .sort((a, b) => +a.start - +b.start);

  return (
    <div className="space-y-6">

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

      {linkedPerson && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4" /> Meine Einsätze
            </CardTitle>
            <CardDescription>
              Anstehende Einsätze von {linkedPerson.name} — geplant wird im
              Projekt (Tab Personal &amp; Transport).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Keine anstehenden Einsätze.
              </p>
            ) : (
              <ul className="divide-y">
                {upcoming.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
                  >
                    <span className="font-medium text-foreground">
                      {a.timed
                        ? `${formatDateTime(a.start)} – ${formatDateTime(a.end)}`
                        : `${formatDate(a.start)} – ${formatDate(a.end)} (ganztägig)`}
                    </span>
                    <Link
                      href={`/projects/${a.projectId}`}
                      className="font-medium hover:underline"
                    >
                      {a.projectName}
                    </Link>
                    <span className="text-muted-foreground">{a.serviceName}</span>
                    <Badge variant={projectStatusVariant(a.status)}>
                      {projectStatusLabel(a.status)}
                    </Badge>
                    {a.notes && (
                      <span className="text-xs text-muted-foreground">
                        📝 {a.notes}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kalender-Feeds zum Abonnieren</CardTitle>
          <CardDescription>
            ICS-URLs für Google Kalender, Apple Kalender oder Outlook: Planungs-
            und Berechnungszeiträume (alle Projekte) sowie deine persönliche
            Personalplanung — Aktualisierung erfolgt automatisch.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CalendarFeedForm
            initialToken={calendarToken}
            personalToken={personalToken}
          />
        </CardContent>
      </Card>
    </div>
  );
}
