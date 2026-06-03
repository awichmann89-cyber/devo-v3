import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { buildIcs, IcsEvent } from "@/lib/ics";
import { ProjectStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const expected = await getSetting("calendarFeedToken");
  if (!expected || !token || token !== expected) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const projects = await prisma.project.findMany({
    where: { status: { not: ProjectStatus.CANCELLED } },
    include: { customer: { select: { name: true } } },
    orderBy: { planningStart: "asc" },
  });

  const events: IcsEvent[] = projects.map((p) => ({
    uid: `project-${p.id}-planning@devo`,
    start: p.planningStart,
    end: p.planningEnd,
    summary: p.name,
    description: p.customer?.name ?? undefined,
  }));

  const ics = buildIcs("devo Planungszeiträume", events);
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
