import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildIcs, IcsEvent } from "@/lib/ics";
import { projectStatusEmoji } from "@/lib/labels";
import { buildAssignmentCalendarDescription } from "@/lib/calendar-description";

export const dynamic = "force-dynamic";

const APP_TZ = "Europe/Berlin";

/** Menschlich lesbares Zeitfenster für die DESCRIPTION. */
function timeLabel(
  plannedStart: Date | null,
  plannedEnd: Date | null,
  planningStart: Date,
  planningEnd: Date
): string {
  const fmtDate = (d: Date) =>
    d.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: APP_TZ,
    });
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: APP_TZ,
    });
  if (plannedStart && plannedEnd) {
    if (fmtDate(plannedStart) === fmtDate(plannedEnd)) {
      return `${fmtDate(plannedStart)}, ${fmtTime(plannedStart)}–${fmtTime(plannedEnd)} Uhr`;
    }
    return `${fmtDate(plannedStart)} ${fmtTime(plannedStart)} – ${fmtDate(plannedEnd)} ${fmtTime(plannedEnd)}`;
  }
  return `ganztägig, ${fmtDate(planningStart)} – ${fmtDate(planningEnd)}`;
}

/**
 * Persönlicher Einsatz-Feed: ein VEVENT pro Einsatz der Person.
 * Auth über den Personen-Token (?token=…) — derselbe Token wie für die
 * Zeiterfassungs-Seite /einsatz/[token].
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const person = await prisma.person.findFirst({
    where: { personalToken: token, active: true },
    select: { id: true, name: true },
  });
  if (!person) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const assignments = await prisma.personAssignment.findMany({
    where: { personId: person.id },
    include: {
      projectService: {
        select: { serviceItem: { select: { name: true } } },
      },
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
    orderBy: { createdAt: "asc" },
  });

  const events: IcsEvent[] = assignments.map((a) => {
    const timed = a.plannedStart !== null && a.plannedEnd !== null;
    const serviceName = a.projectService.serviceItem.name;
    return {
      uid: `person-assignment-${a.id}@cratel`,
      start: timed ? a.plannedStart! : a.project.planningStart,
      end: timed ? a.plannedEnd! : a.project.planningEnd,
      timed,
      summary: `${projectStatusEmoji(a.project.status)} ${a.project.name} — ${serviceName}`,
      description: buildAssignmentCalendarDescription({
        customerName: a.project.customer?.name,
        serviceName,
        timeLabel: timeLabel(
          a.plannedStart,
          a.plannedEnd,
          a.project.planningStart,
          a.project.planningEnd
        ),
        notes: a.notes,
      }),
    };
  });

  const ics = buildIcs(`Cratel Einsätze — ${person.name}`, events);
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
