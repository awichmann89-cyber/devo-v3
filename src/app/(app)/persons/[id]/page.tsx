import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import { Badge } from "@/components/ui/badge";
import { DetailHeader } from "@/components/layout/detail-header";
import { AlertTriangle, CalendarClock, Receipt } from "lucide-react";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import {
  conflictSeverityHint,
  conflictSeverityLabel,
  conflictSeverityVariant,
  employmentTypeLabel,
  employmentTypeVariant,
} from "@/lib/labels";
import { hasClockTime } from "@/lib/personnel-schedule";
import { maxSeverity } from "@/lib/booking-conflicts";
import { conflictsByBooking, loadPersonBookings } from "@/lib/booking-load";
import { PersonLinksCard } from "./person-links-card";
import { PersonEditButton } from "./person-edit-button";
import { TimeEntriesSection } from "./time-entries-section";

export default async function PersonDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const person = await prisma.person.findUnique({
    where: { id },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!person) notFound();

  // Token lazy anlegen (Muster /calendar mit getOrCreateCalendarToken) —
  // die Links-Card braucht ihn direkt beim ersten Aufruf.
  let token = person.personalToken;
  if (!token) {
    token = crypto.randomUUID().replace(/-/g, "");
    await prisma.person.update({
      where: { id },
      data: { personalToken: token },
    });
  }

  const [assignments, timeEntries, projects, users] = await Promise.all([
    prisma.personAssignment.findMany({
      where: { personId: id },
      include: {
        projectService: {
          select: { serviceItem: { select: { name: true } } },
        },
        billingPeriod: { select: { start: true, end: true } },
        project: {
          select: {
            id: true,
            name: true,
            planningStart: true,
            planningEnd: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.timeEntry.findMany({
      where: { personId: id },
      include: { project: { select: { name: true } } },
      orderBy: { workDate: "desc" },
    }),
    prisma.project.findMany({
      select: { id: true, name: true },
      orderBy: { planningStart: "desc" },
      take: 200,
    }),
    prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const personVM = {
    id: person.id,
    name: person.name,
    employmentType: person.employmentType,
    email: person.email,
    phone: person.phone,
    address: person.address,
    notes: person.notes,
    active: person.active,
    hourlyWage: person.hourlyWage != null ? Number(person.hourlyWage) : null,
    defaultDayRate:
      person.defaultDayRate != null ? Number(person.defaultDayRate) : null,
    userId: person.userId,
  };

  // Überbuchungen dieser Person — dieselbe Bewertung wie im Projekt.
  const bookings = await loadPersonBookings([id]);
  const bookingConflicts = conflictsByBooking(bookings);

  const now = new Date();
  const sortedAssignments = assignments
    .map((a) => ({
      id: a.id,
      projectId: a.project.id,
      projectName: a.project.name,
      serviceName: a.projectService.serviceItem.name,
      // Fallback-Kette: Uhrzeiten → Berechnungszeitraum → Planungszeitraum
      start: a.plannedStart ?? a.billingPeriod?.start ?? a.project.planningStart,
      end: a.plannedEnd ?? a.billingPeriod?.end ?? a.project.planningEnd,
      // Zeitgenau auch, wenn der zugrunde liegende Zeitraum Uhrzeiten trägt.
      timed:
        a.plannedStart !== null ||
        hasClockTime(a.billingPeriod?.start ?? a.project.planningStart) ||
        hasClockTime(a.billingPeriod?.end ?? a.project.planningEnd),
      agreedRate: a.agreedRate != null ? Number(a.agreedRate) : null,
      invoiceReceived: a.invoiceReceived,
      notes: a.notes,
      conflicts: bookingConflicts[a.id] ?? [],
    }))
    .sort((a, b) => +b.start - +a.start);

  return (
    <div className="space-y-4">
      <DetailHeader
        backHref="/persons"
        title={person.name}
        badges={
          <>
            <Badge variant={employmentTypeVariant(person.employmentType)}>
              {employmentTypeLabel(person.employmentType)}
            </Badge>
            {!person.active && <Badge variant="outline">Inaktiv</Badge>}
          </>
        }
        actions={<PersonEditButton person={personVM} users={users} />}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Stammdaten</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <dl className="grid grid-cols-[120px_1fr] gap-y-1.5">
              <dt className="text-muted-foreground">E-Mail</dt>
              <dd>{person.email ?? "—"}</dd>
              <dt className="text-muted-foreground">Telefon</dt>
              <dd>{person.phone ?? "—"}</dd>
              <dt className="text-muted-foreground">Adresse</dt>
              <dd className="whitespace-pre-line">{person.address ?? "—"}</dd>
              <dt className="text-muted-foreground">Cratel-Account</dt>
              <dd>{person.user ? (person.user.name ?? person.user.email) : "—"}</dd>
              {person.employmentType === "MINIJOBBER" && (
                <>
                  <dt className="text-muted-foreground">Stundenlohn</dt>
                  <dd className="font-mono">
                    {personVM.hourlyWage != null
                      ? `${formatCurrency(personVM.hourlyWage)} / h`
                      : "—"}
                  </dd>
                </>
              )}
              {person.employmentType === "FREELANCER" && (
                <>
                  <dt className="text-muted-foreground">Tagessatz</dt>
                  <dd className="font-mono">
                    {personVM.defaultDayRate != null
                      ? `${formatCurrency(personVM.defaultDayRate)} / Tag`
                      : "—"}
                  </dd>
                </>
              )}
            </dl>
            {person.notes && (
              <p className="border-t pt-2 text-muted-foreground whitespace-pre-line">
                {person.notes}
              </p>
            )}
          </CardContent>
        </Card>

        <PersonLinksCard personId={person.id} initialToken={token} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" /> Einsätze
            <InfoHint text="Alle Einsätze — geplant wird im Projekt (Tab Personal & Transport)." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sortedAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Einsätze geplant.
            </p>
          ) : (
            <ul className="divide-y">
              {sortedAssignments.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
                >
                  <Link
                    href={`/projects/${a.projectId}`}
                    className="font-medium hover:underline"
                  >
                    {a.projectName}
                  </Link>
                  <span className="text-muted-foreground">{a.serviceName}</span>
                  <span className="text-xs text-muted-foreground">
                    {a.timed
                      ? `${formatDateTime(a.start)} – ${formatDateTime(a.end)}`
                      : `ganztägig, ${formatDate(a.start)} – ${formatDate(a.end)}`}
                  </span>
                  {a.end >= now && <Badge variant="secondary">geplant</Badge>}
                  {(() => {
                    const severity = maxSeverity(a.conflicts);
                    if (!severity) return null;
                    return (
                      <Badge
                        variant={conflictSeverityVariant(severity)}
                        className="gap-1"
                        title={`${conflictSeverityHint(
                          severity,
                          "Die Person"
                        )}: ${a.conflicts.map((c) => c.projectName).join(", ")}`}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {conflictSeverityLabel(severity)}
                      </Badge>
                    );
                  })()}
                  {a.agreedRate != null && (
                    <span className="ml-auto flex items-center gap-2">
                      <span className="font-mono">{formatCurrency(a.agreedRate)}</span>
                      <Badge
                        variant={a.invoiceReceived ? "success" : "warning"}
                        className="gap-1"
                      >
                        <Receipt className="h-3 w-3" />
                        {a.invoiceReceived ? "Rechnung erhalten" : "Rechnung offen"}
                      </Badge>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <TimeEntriesSection
        personId={person.id}
        employmentType={person.employmentType}
        hourlyWage={personVM.hourlyWage}
        entries={timeEntries.map((e) => ({
          id: e.id,
          projectId: e.projectId,
          projectName: e.project.name,
          workDate: e.workDate.toISOString(),
          startMinute: e.startMinute,
          endMinute: e.endMinute,
          breakMinutes: e.breakMinutes,
          hourlyWageSnapshot:
            e.hourlyWageSnapshot != null ? Number(e.hourlyWageSnapshot) : null,
          notes: e.notes,
        }))}
        projects={projects}
      />
    </div>
  );
}
