import type { Prisma } from "@prisma/client";
import { daysBetween } from "@/lib/utils";
import { DayFactorMap, getDayFactor } from "@/lib/settings";

/**
 * Berechnet den Gesamtwert (netto, vor MwSt.) eines Projekts unter Berücksichtigung
 * aller Gruppen-, Bereichs- und projektweiten Rabatte.
 *
 * Buchungen sind seit dem Refactor direkt Geräte (Device), keine Pack-Einheiten mehr.
 */
type ProjectForPricing = Prisma.ProjectGetPayload<{
  include: {
    billingPeriods: true;
    groups: true;
    assignments: { include: { device: true } };
    services: { include: { serviceItem: true } };
    adHocItems: true;
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
  // Bei Verkauf-Projekten gilt kein Tagesfaktor.
  const factor =
    (project.kind as string) === "VERKAUF"
      ? 1
      : getDayFactor(days, factorMap);

  // Pro-Gruppe-Netto sammeln. Nicht-abrechenbare Gruppen werden komplett
  // ignoriert — sie fließen nicht in Summen oder Rabatte ein und tauchen
  // entsprechend nicht auf Angeboten/Rechnungen auf.
  const billableGroups = project.groups.filter((g) => g.billable);
  const groupNet = new Map<string, number>();
  for (const g of billableGroups) {
    let sub = 0;
    if (g.kind === "MATERIAL") {
      for (const a of project.assignments) {
        if (a.groupId !== g.id) continue;
        sub += Number(a.device.dailyRate) * a.quantity * factor;
      }
      // Ad-hoc-Positionen — wie Geräte mit Tagesfaktor (bei Verkauf = 1).
      for (const it of project.adHocItems) {
        if (it.groupId !== g.id) continue;
        sub += Number(it.unitPrice) * it.quantity * factor;
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

  const materialSub = billableGroups
    .filter((g) => g.kind === "MATERIAL")
    .reduce((s, g) => s + (groupNet.get(g.id) ?? 0), 0);
  const servicesSub = billableGroups
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
