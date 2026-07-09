import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { ForecastView, ForecastRowVM } from "./forecast-view";
import { calculateProjectTotal } from "@/lib/project-pricing";
import { getSettings, parseDayFactorMap } from "@/lib/settings";

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
  await requireAuth();
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
      groups: true,
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
      // Interne Zusatzkosten (Zumietung + Extrakosten) → für den Gewinn.
      const costs =
        p.subhires.reduce((s, x) => s + Number(x.unitCost) * x.quantity, 0) +
        p.extraCosts.reduce((s, c) => s + Number(c.amount), 0);
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
    <div className="space-y-6">
      <div>
        <p className="text-muted-foreground">
          Erwarteter Umsatz und Gewinn aus geplanten Projekten im gewählten
          Zeitraum. Der Gewinn zieht interne Zusatzkosten (Zumietung + Extrakosten)
          vom Projektwert ab — diese erscheinen nie auf Angeboten/Rechnungen.{" "}
          <strong>Alle Beträge sind Nettowerte</strong> (vor MwSt.).
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Keine Projekte in diesem Zeitraum.
          </CardContent>
        </Card>
      ) : (
        <ForecastView
          rows={rows}
          initialFrom={isoDate(from)}
          initialTo={isoDate(to)}
        />
      )}
    </div>
  );
}
