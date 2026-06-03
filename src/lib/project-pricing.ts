import type { Prisma } from "@prisma/client";
import { daysBetween } from "@/lib/utils";
import { DayFactorMap, getDayFactor } from "@/lib/settings";

/**
 * Berechnet den Gesamtwert (netto, vor MwSt.) eines Projekts unter Berücksichtigung
 * aller Gruppen-, Bereichs- und projektweiten Rabatte.
 *
 * Die Tageberechnung ist identisch mit der im Projekt-Detail und im PDF — wir
 * verwenden den zentralen `daysBetween`-Helper aus `lib/utils`.
 */
type ProjectForPricing = Prisma.ProjectGetPayload<{
  include: {
    billingPeriods: true;
    groups: true;
    assignments: {
      include: {
        packUnit: { include: { items: { include: { device: true } } } };
      };
    };
    services: { include: { serviceItem: true } };
  };
}>;

export function calculateProjectTotal(
  project: ProjectForPricing,
  factorMap: DayFactorMap
): number {
  const days = project.billingPeriods.reduce(
    (sum, p) => sum + daysBetween(p.start, p.end),
    0
  );
  const factor = getDayFactor(days, factorMap);

  // Pro-Gruppe-Netto sammeln
  const groupNet = new Map<string, number>();
  for (const g of project.groups) {
    let sub = 0;
    if (g.kind === "MATERIAL") {
      for (const a of project.assignments) {
        if (a.groupId !== g.id) continue;
        for (const it of a.packUnit.items) {
          sub += Number(it.device.dailyRate) * it.quantity * a.quantity * factor;
        }
      }
    } else {
      for (const s of project.services) {
        if (s.groupId !== g.id) continue;
        const price = s.unitPriceOverride
          ? Number(s.unitPriceOverride)
          : Number(s.serviceItem.unitPrice);
        sub += Number(s.quantity) * price;
      }
    }
    const pct = Number(g.discountPercent ?? 0) || 0;
    groupNet.set(g.id, sub - (sub * pct) / 100);
  }

  // Bereich
  const materialSub = project.groups
    .filter((g) => g.kind === "MATERIAL")
    .reduce((s, g) => s + (groupNet.get(g.id) ?? 0), 0);
  const servicesSub = project.groups
    .filter((g) => g.kind === "SERVICE")
    .reduce((s, g) => s + (groupNet.get(g.id) ?? 0), 0);

  const matPct = Number(project.materialDiscountPercent ?? 0) || 0;
  const svcPct = Number(project.servicesDiscountPercent ?? 0) || 0;
  const materialNet = materialSub - (materialSub * matPct) / 100;
  const servicesNet = servicesSub - (servicesSub * svcPct) / 100;

  const sub = materialNet + servicesNet;
  const projPct = Number(project.discountPercent ?? 0) || 0;
  return sub - (sub * projPct) / 100;
}
