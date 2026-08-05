import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildIcs, IcsEvent } from "@/lib/ics";
import { projectStatusEmoji } from "@/lib/labels";
import { buildAssignmentCalendarDescription } from "@/lib/calendar-description";
import { hasClockTime } from "@/lib/personnel-schedule";

export const dynamic = "force-dynamic";

const APP_TZ = "Europe/Berlin";

/**
 * Menschlich lesbares Zeitfenster für die DESCRIPTION — Fallback-Kette:
 * Uhrzeiten → gewählter Berechnungszeitraum → Projekt-Planungszeitraum.
 */
function timeLabel(
  plannedStart: Date | null,
  plannedEnd: Date | null,
  allDayStart: Date,
  allDayEnd: Date
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
  return `ganztägig, ${fmtDate(allDayStart)} – ${fmtDate(allDayEnd)}`;
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
      billingPeriod: { select: { start: true, end: true } },
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
    const serviceName = a.projectService.serviceItem.name;
    // Fallback-Kette: Uhrzeiten → Zeitraum (inkl. dessen Uhrzeiten) →
    // Planungszeitraum. Nur 00:00-Zeiträume werden ganztägig ausgegeben.
    const base = a.billingPeriod ?? {
      start: a.project.planningStart,
      end: a.project.planningEnd,
    };
    const timed =
      (a.plannedStart !== null && a.plannedEnd !== null) ||
      hasClockTime(base.start) ||
      hasClockTime(base.end);
    const start = a.plannedStart ?? base.start;
    const end = a.plannedEnd ?? base.end;
    return {
      uid: `person-assignment-${a.id}@cratel`,
      start,
      end,
      timed,
      summary: `${projectStatusEmoji(a.project.status)} ${a.project.name} — ${serviceName}`,
      description: buildAssignmentCalendarDescription({
        customerName: a.project.customer?.name,
        serviceName,
        timeLabel: timeLabel(
          timed ? start : null,
          timed ? end : null,
          base.start,
          base.end
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
