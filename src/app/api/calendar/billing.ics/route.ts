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
    include: {
      customer: { select: { name: true } },
      billingPeriods: { orderBy: { start: "asc" } },
    },
    orderBy: { planningStart: "asc" },
  });

  const events: IcsEvent[] = [];
  for (const p of projects) {
    p.billingPeriods.forEach((bp, idx) => {
      events.push({
        uid: `project-${p.id}-billing-${bp.id}@devo`,
        start: bp.start,
        end: bp.end,
        summary:
          p.billingPeriods.length > 1
            ? `${p.name} (Periode ${idx + 1})`
            : p.name,
        description: p.customer?.name ?? undefined,
      });
    });
  }

  const ics = buildIcs("devo Berechnungszeiträume", events);
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
