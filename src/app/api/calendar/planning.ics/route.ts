import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { buildIcs, IcsEvent } from "@/lib/ics";
import { projectStatusEmoji } from "@/lib/labels";
import {
  aggregateDeviceCounts,
  buildProjectCalendarDescription,
} from "@/lib/calendar-description";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const expected = await getSetting("calendarFeedToken");
  if (!expected || !token || token !== expected) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Stornierte Projekte bleiben im Feed sichtbar — der Status wird über das
  // Emoji im Betreff transportiert.
  const projects = await prisma.project.findMany({
    include: {
      customer: { select: { name: true } },
      projectNotes: { orderBy: { updatedAt: "desc" } },
      assignments: {
        select: { quantity: true, device: { select: { name: true } } },
      },
    },
    orderBy: { planningStart: "asc" },
  });

  const events: IcsEvent[] = projects.map((p) => ({
    uid: `project-${p.id}-planning@cratel`,
    start: p.planningStart,
    end: p.planningEnd,
    summary: `${projectStatusEmoji(p.status)} ${p.name}`,
    description: buildProjectCalendarDescription({
      customerName: p.customer?.name,
      devices: aggregateDeviceCounts(p.assignments),
      notes: p.projectNotes,
    }),
  }));

  const ics = buildIcs("Cratel Planungszeiträume", events);
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
