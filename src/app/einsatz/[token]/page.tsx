import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EinsatzClient } from "./einsatz-client";

export const dynamic = "force-dynamic";

export default async function PublicEinsatzPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;

  const person = await prisma.person.findFirst({
    where: { personalToken: token, active: true },
    select: { id: true, name: true, employmentType: true },
  });
  if (!person) notFound();

  const [assignments, timeEntries] = await Promise.all([
    prisma.personAssignment.findMany({
      where: { personId: person.id },
      include: {
        projectService: {
          select: { serviceItem: { select: { name: true } } },
        },
        billingPeriod: { select: { start: true, end: true, notes: true } },
        project: {
          select: {
            name: true,
            status: true,
            planningStart: true,
            planningEnd: true,
            customer: { select: { name: true } },
          },
        },
      },
    }),
    prisma.timeEntry.findMany({
      where: { personId: person.id },
      include: { project: { select: { name: true } } },
      orderBy: { workDate: "desc" },
    }),
  ]);

  const assignmentVMs = assignments.map((a) => ({
    id: a.id,
    projectName: a.project.name,
    projectStatus: a.project.status,
    customerName: a.project.customer?.name ?? null,
    serviceName: a.projectService.serviceItem.name,
    plannedStart: a.plannedStart?.toISOString() ?? null,
    plannedEnd: a.plannedEnd?.toISOString() ?? null,
    periodStart: a.billingPeriod?.start.toISOString() ?? null,
    periodEnd: a.billingPeriod?.end.toISOString() ?? null,
    periodNotes: a.billingPeriod?.notes ?? null,
    planningStart: a.project.planningStart.toISOString(),
    planningEnd: a.project.planningEnd.toISOString(),
    notes: a.notes,
  }));

  const entryVMs = timeEntries.map((e) => ({
    id: e.id,
    assignmentId: e.assignmentId,
    projectName: e.project.name,
    workDate: e.workDate.toISOString(),
    startMinute: e.startMinute,
    endMinute: e.endMinute,
    breakMinutes: e.breakMinutes,
    notes: e.notes,
  }));

  return (
    <EinsatzClient
      token={token}
      personName={person.name}
      assignments={assignmentVMs}
      timeEntries={entryVMs}
    />
  );
}
