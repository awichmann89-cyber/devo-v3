import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { ForecastView, ForecastRowVM } from "./forecast-view";
import { calculateProjectTotal } from "@/lib/project-pricing";
import { getSettings, parseDayFactorMap } from "@/lib/settings";
import { assignmentCost, timeEntryCost, workedMinutes } from "@/lib/personnel-costs";
import { effectivePlannedMinutes } from "@/lib/personnel-schedule";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDate(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(s);
  if (isNaN(d.getTime())) return fallback;
  return d;
}

export default async function ForecastPage(props: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requireAuth();
  const sp = await props.searchParams;

  // Default-Bereich: aktueller Monat + die nächsten 3 Monate
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 3, 0);
  const from = parseDate(sp.from, defaultFrom);
  const to = parseDate(sp.to, defaultTo);
  const fromEnd = new Date(from);
  fromEnd.setHours(0, 0, 0, 0);
  const toEnd = new Date(to);
  toEnd.setHours(23, 59, 59, 999);

  const factorMap = parseDayFactorMap((await getSettings()).dayFactorMap);

  // Alle Projekte im Range laden (inkl. CANCELLED — Filter passiert clientseitig)
  const allProjects = await prisma.project.findMany({
    where: {
      planningEnd: { gte: fromEnd },
      planningStart: { lte: toEnd },
    },
    include: {
      customer: { select: { name: true } },
      billingPeriods: { orderBy: { start: "asc" } },
      // billingPeriods der Gruppen: Tagesfaktor pro Materialgruppe
      groups: { include: { billingPeriods: true } },
      assignments: {
        include: {
          device: true,
        },
      },
      services: { include: { serviceItem: true } },
      adHocItems: true,
      invoices: { select: { totalNet: true } },
      // Interne Zusatzkosten für die Gewinn-Berechnung (nicht kundenrelevant).
      subhires: { select: { quantity: true, unitCost: true } },
      extraCosts: { select: { amount: true } },
      // Personalkosten aus dem Einsatzplan: Pauschalen, Ist-Stunden und
      // geplante Stunden × Satz (solange keine Zeiten erfasst sind).
      personAssignments: {
        select: {
          id: true,
          agreedRate: true,
          hourlyRate: true,
          plannedStart: true,
          plannedEnd: true,
          billingPeriod: { select: { start: true, end: true } },
          person: { select: { employmentType: true, hourlyWage: true } },
        },
      },
      timeEntries: {
        select: {
          assignmentId: true,
          startMinute: true,
          endMinute: true,
          breakMinutes: true,
          hourlyWageSnapshot: true,
        },
      },
    },
    orderBy: { planningStart: "asc" },
  });

  const rows: ForecastRowVM[] = allProjects
    .map((p) => {
      const billingStart = p.billingPeriods[0]?.start ?? p.planningStart;
      const billingEnd =
        p.billingPeriods[p.billingPeriods.length - 1]?.end ?? p.planningEnd;
      return { p, billingStart, billingEnd };
    })
    .filter(({ billingStart, billingEnd }) => {
      return billingEnd >= fromEnd && billingStart <= toEnd;
    })
    .map(({ p, billingStart, billingEnd }) => {
      const total = calculateProjectTotal(p, factorMap);
      const invoiced = p.invoices.reduce(
        (s, inv) => s + Number(inv.totalNet),
        0
      );
      // Interne Zusatzkosten (Zumietung + Extrakosten + Personal) → für den Gewinn.
      // Ist-Zeiten pro Einsatz gruppieren (Zeiten ohne Einsatz zählen separat).
      const byAssignment = new Map<string, { minutes: number; cost: number }>();
      let orphanTimeCost = 0;
      for (const e of p.timeEntries) {
        const entry = {
          startMinute: e.startMinute,
          endMinute: e.endMinute,
          breakMinutes: e.breakMinutes,
          hourlyWageSnapshot:
            e.hourlyWageSnapshot !== null ? Number(e.hourlyWageSnapshot) : null,
        };
        if (!e.assignmentId) {
          orphanTimeCost += timeEntryCost(entry);
          continue;
        }
        const agg = byAssignment.get(e.assignmentId) ?? { minutes: 0, cost: 0 };
        agg.minutes += workedMinutes(entry);
        agg.cost += timeEntryCost(entry);
        byAssignment.set(e.assignmentId, agg);
      }
      const personnelCost =
        p.personAssignments.reduce((s, a) => {
          const logged = byAssignment.get(a.id) ?? { minutes: 0, cost: 0 };
          return (
            s +
            assignmentCost({
              agreedRate: a.agreedRate !== null ? Number(a.agreedRate) : null,
              hourlyRate: a.hourlyRate !== null ? Number(a.hourlyRate) : null,
              isMinijobber: a.person.employmentType === "MINIJOBBER",
              personHourlyWage:
                a.person.hourlyWage !== null ? Number(a.person.hourlyWage) : null,
              plannedMinutes: effectivePlannedMinutes({
                plannedStart: a.plannedStart,
                plannedEnd: a.plannedEnd,
                billingPeriod: a.billingPeriod,
                projectPlanningStart: p.planningStart,
                projectPlanningEnd: p.planningEnd,
              }),
              loggedMinutes: logged.minutes,
              timeCost: logged.cost,
            }).cost
          );
        }, 0) + orphanTimeCost;
      const costs =
        p.subhires.reduce((s, x) => s + Number(x.unitCost) * x.quantity, 0) +
        p.extraCosts.reduce((s, c) => s + Number(c.amount), 0) +
        personnelCost;
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        customerName: p.customer?.name ?? null,
        billingStart: billingStart.toISOString(),
        billingEnd: billingEnd.toISOString(),
        total,
        invoiced,
        outstanding: total - invoiced,
        hasInvoice: p.invoices.length > 0,
        costs,
        profit: total - costs,
      };
    });

  return (
    <div className="space-y-4">
      <ForecastView
        rows={rows}
        initialFrom={isoDate(from)}
        initialTo={isoDate(to)}
        userId={session.user.id ?? null}
      />
    </div>
  );
}
