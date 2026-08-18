import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile, StatTileGrid } from "@/components/ui/stat-tile";
import { DetailHeader } from "@/components/layout/detail-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { FileText, Boxes, StickyNote, Truck, CalendarRange, Wallet, Paperclip, HandCoins } from "lucide-react";
import { formatCurrency, formatDate, daysBetween, serialize } from "@/lib/utils";
import {
  projectKindLabel,
  projectKindVariant,
  projectStatusLabel,
  projectStatusVariant,
} from "@/lib/labels";
import { getSettings, parseDayFactorMap, getDayFactor } from "@/lib/settings";
import { userLabel } from "@/lib/note-tasks";
import { ProjectForm } from "../project-form";
import { AssignmentsSection } from "./assignments-section";
import { NotesSection } from "./notes-section";
import { FilesSection } from "./files-section";
import { PeriodsSection } from "./periods-section";
import { ServicesSection } from "./services-section";
import { FinancesSection } from "./finances-section";
import { CostsSection } from "./costs-section";
import { DeleteProjectButton } from "./delete-button";
import { CopyProjectButton } from "./copy-button";
import { getOverlappingAssignments } from "@/lib/availability";
import { buildPackList } from "@/lib/packlist";
import { assignmentCost, timeEntryCost, workedMinutes } from "@/lib/personnel-costs";
import {
  assignmentEffectiveRange,
  effectivePlannedMinutes,
  rangesOverlap,
} from "@/lib/personnel-schedule";
import { auth } from "@/auth";
import { hasRole, CAN_WRITE } from "@/lib/auth-helpers";

export default async function ProjectDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const [project, session, serviceCatalog] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        customer: true,
        billingPeriods: { orderBy: { start: "asc" } },
        projectNotes: { orderBy: { updatedAt: "desc" } },
        groups: {
          // billingPeriods der Gruppe: Tagesfaktor pro Materialgruppe bzw.
          // Planungsgrundlage für Personal-Einsätze (SERVICE).
          include: { billingPeriods: { select: { id: true, start: true, end: true } } },
          orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
        },
        invoices: { orderBy: { date: "desc" } },
        quotes: { orderBy: { date: "desc" } },
        services: {
          include: {
            serviceItem: true,
            // Einsatzplan: Personen an dieser Position inkl. Ist-Minuten
            personAssignments: {
              include: {
                person: {
                  select: { name: true, employmentType: true, hourlyWage: true },
                },
                billingPeriod: {
                  select: { id: true, start: true, end: true, notes: true },
                },
                timeEntries: {
                  select: {
                    startMinute: true,
                    endMinute: true,
                    breakMinutes: true,
                    hourlyWageSnapshot: true,
                  },
                },
              },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
        // Ist-Arbeitszeiten (für Personalkosten in der Gewinnrechnung)
        timeEntries: {
          select: {
            assignmentId: true,
            startMinute: true,
            endMinute: true,
            breakMinutes: true,
            hourlyWageSnapshot: true,
          },
        },
        assignments: {
          include: {
            device: { include: { category: true } },
          },
          orderBy: { sortOrder: "asc" },
        },
        cableAssignments: {
          include: {
            cable: { include: { category: true } },
          },
          orderBy: { sortOrder: "asc" },
        },
        adHocItems: {
          orderBy: { sortOrder: "asc" },
        },
        groupComments: {
          orderBy: { sortOrder: "asc" },
        },
        packingScans: {
          select: { id: true, packUnitId: true, deviceId: true, cableId: true },
        },
        files: {
          include: {
            uploadedBy: { select: { name: true, email: true } },
          },
          orderBy: { uploadedAt: "desc" },
        },
        // Zumietungen + Extrakosten (rein interne Kostenschicht)
        subhires: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        extraCosts: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        createdBy: { select: { name: true, email: true } },
      },
    }),
    auth(),
    prisma.serviceItem.findMany({
      where: { active: true },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    }),
  ]);
  if (!project) notFound();
  const canWrite = hasRole(session?.user.role, CAN_WRITE);

  const [allDevices, allCables, allCategories, customers, users, activePersons] = await Promise.all([
    prisma.device.findMany({
      include: { category: true },
      orderBy: { name: "asc" },
    }),
    prisma.cable.findMany({
      include: { category: true },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.person.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        employmentType: true,
        hourlyWage: true,
        defaultDayRate: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const overlap = await getOverlappingAssignments(
    project.assignments.map((a) => a.deviceId),
    project.planningStart,
    project.planningEnd
  );

  type BlockingPack = {
    code: string;
    name: string;
    perUnit: number;
    useCount: number;
    packStockQuantity: number;
  };
  type OtherProject = {
    projectId: string;
    projectName: string;
    planningStart: Date;
    planningEnd: Date;
    bookedQuantity: number;
    effectiveQuantity: number;
    blockingPackUnits: BlockingPack[];
  };
  type StockInfo = {
    totalDemand: number;
    otherProjects: OtherProject[];
    // Eigene Werte dieses Projekts — getrennt, damit die Konflikt-Anzeige
    // klar zwischen "eigene FIXED-Pack-Aufrundung" und "Fremdprojekt belegt"
    // unterscheiden kann.
    ownBookedQuantity: number;
    ownEffectiveQuantity: number;
    ownBlockingPackUnits: BlockingPack[];
  };
  const conflictMap: Record<string, StockInfo> = {};
  const reservedDeviceIds = new Set<string>();
  // Aggregieren pro (projectId, deviceId): `effectiveQuantity` ist bereits
  // der Projekt-Total für dieses Gerät (siehe getOverlappingAssignments).
  // Wenn ein Projekt dasselbe Gerät mehrfach gebucht hat (z.B. einmal pro
  // Gruppe), gibt es mehrere Assignment-Einträge mit derselben
  // effectiveQuantity — die dürfen wir aber NUR EINMAL in totalDemand
  // anrechnen, sonst wird Demand künstlich verdoppelt und schlägt false-
  // positive Konflikte. `quantity` dagegen ist per-Assignment und wird
  // korrekt aufsummiert.
  type AggOverlap = {
    projectId: string;
    deviceId: string;
    project: (typeof overlap)[number]["project"];
    quantitySum: number;
    effectiveQuantity: number;
    blockingPackUnits: BlockingPack[];
    anyReserved: boolean;
  };
  const aggMap = new Map<string, AggOverlap>();
  for (const o of overlap) {
    const key = `${o.projectId}:${o.deviceId}`;
    const existing = aggMap.get(key);
    if (existing) {
      existing.quantitySum += o.quantity;
      existing.anyReserved = existing.anyReserved || o.isReserved;
    } else {
      aggMap.set(key, {
        projectId: o.projectId,
        deviceId: o.deviceId,
        project: o.project,
        quantitySum: o.quantity,
        effectiveQuantity: o.effectiveQuantity,
        blockingPackUnits: o.blockingPackUnits,
        anyReserved: o.isReserved,
      });
    }
  }

  for (const agg of aggMap.values()) {
    const entry = (conflictMap[agg.deviceId] ??= {
      totalDemand: 0,
      otherProjects: [],
      ownBookedQuantity: 0,
      ownEffectiveQuantity: 0,
      ownBlockingPackUnits: [],
    });
    entry.totalDemand += agg.effectiveQuantity;
    if (agg.projectId === project.id) {
      if (agg.anyReserved) reservedDeviceIds.add(agg.deviceId);
      entry.ownBookedQuantity = agg.quantitySum;
      entry.ownEffectiveQuantity = agg.effectiveQuantity;
      entry.ownBlockingPackUnits = agg.blockingPackUnits;
    } else {
      entry.otherProjects.push({
        projectId: agg.project.id,
        projectName: agg.project.name,
        planningStart: agg.project.planningStart,
        planningEnd: agg.project.planningEnd,
        bookedQuantity: agg.quantitySum,
        effectiveQuantity: agg.effectiveQuantity,
        blockingPackUnits: agg.blockingPackUnits,
      });
    }
  }

  // ---------- Kabel-Konflikt-Map ----------
  // Pro Kabel: gesamte Allokation = (PackUnit-Inhalt × PU.Bestand) + Buchungen
  // anderer überlappender Projekte. Wenn die eigene Buchung diese Allokation
  // plus den eigenen Bedarf über den Lagerbestand drückt, gibt's einen Konflikt.
  type CableConflictInfo = {
    stock: number;
    packAllocation: number;
    foreignBookings: { projectName: string; quantity: number }[];
    foreignTotal: number;
  };
  // packAllocation für ALLE Kabel (auch nicht-gebuchte — Katalog zeigt sie)
  // foreignBookings nur für Kabel, die in überlappenden Projekten auftauchen
  const bookedCableIds = project.cableAssignments.map((c) => c.cableId);
  const [packCableAllocs, foreignCableBookings] = await Promise.all([
    prisma.packUnitCable.findMany({
      select: {
        cableId: true,
        quantity: true,
        packUnit: { select: { stockQuantity: true } },
      },
    }),
    bookedCableIds.length === 0
      ? Promise.resolve([])
      : prisma.projectCableAssignment.findMany({
          where: {
            cableId: { in: bookedCableIds },
            projectId: { not: project.id },
            project: {
              status: { not: "CANCELLED" },
              planningStart: { lte: project.planningEnd },
              planningEnd: { gte: project.planningStart },
            },
          },
          select: {
            cableId: true,
            quantity: true,
            project: { select: { name: true } },
          },
        }),
  ]);
  const cableConflictMap: Record<string, CableConflictInfo> = {};
  // Init aus allCables — damit jeder Katalog-Eintrag eine Allokation findet
  for (const c of allCables) {
    cableConflictMap[c.id] = {
      stock: c.stockQuantity,
      packAllocation: 0,
      foreignBookings: [],
      foreignTotal: 0,
    };
  }
  for (const pca of packCableAllocs) {
    const entry = cableConflictMap[pca.cableId];
    if (!entry) continue;
    entry.packAllocation += pca.quantity * (pca.packUnit.stockQuantity ?? 1);
  }
  for (const fb of foreignCableBookings) {
    const entry = cableConflictMap[fb.cableId];
    if (!entry) continue;
    entry.foreignTotal += fb.quantity;
    entry.foreignBookings.push({
      projectName: fb.project.name,
      quantity: fb.quantity,
    });
  }

  const billingDays = project.billingPeriods.reduce(
    (sum, p) => sum + daysBetween(p.start, p.end),
    0
  );
  const appSettings = await getSettings();
  const factorMap = parseDayFactorMap(appSettings.dayFactorMap);
  // Bei Verkauf-Projekten wird der Tagesfaktor ignoriert (effektiv 1) —
  // Preise sind Verkaufspreise pro Stück.
  const isSale = project.kind === "VERKAUF";
  const billingFactor = isSale ? 1 : getDayFactor(billingDays, factorMap);

  // Tagesfaktor pro Gruppe: Gruppen mit eigener Zeitraum-Auswahl rechnen nur
  // über deren Tage (Migration 25); ohne Auswahl gilt der globale Wert.
  const groupDays: Record<string, number> = {};
  const groupFactors: Record<string, number> = {};
  const groupPeriodIds: Record<string, string[]> = {};
  for (const g of project.groups) {
    const periods =
      g.billingPeriods.length > 0 ? g.billingPeriods : project.billingPeriods;
    const d = periods.reduce((sum, p) => sum + daysBetween(p.start, p.end), 0);
    groupDays[g.id] = d;
    groupFactors[g.id] = isSale ? 1 : getDayFactor(d, factorMap);
    groupPeriodIds[g.id] = g.billingPeriods.map((p) => p.id);
  }
  const factorForGroup = (groupId: string) => groupFactors[groupId] ?? billingFactor;

  const materialSubtotal =
    project.assignments.reduce((sum, a) => {
      return sum + Number(a.device.dailyRate) * a.quantity * factorForGroup(a.groupId);
    }, 0) +
    project.adHocItems.reduce(
      (sum, it) =>
        sum + Number(it.unitPrice) * it.quantity * factorForGroup(it.groupId),
      0
    );

  const servicesSubtotal = project.services.reduce((sum, s) => {
    const price = s.unitPriceOverride
      ? Number(s.unitPriceOverride)
      : Number(s.serviceItem.unitPrice);
    return sum + Number(s.quantity) * price;
  }, 0);

  /** Brutto-Summe einer Gruppe (vor Gruppen-Rabatt). */
  function groupGross(groupId: string, kind: "MATERIAL" | "SERVICE"): number {
    let sub = 0;
    if (kind === "MATERIAL") {
      // Tagesfaktor der Gruppe (eigene Zeitraum-Auswahl oder global).
      const factor = factorForGroup(groupId);
      for (const a of project!.assignments) {
        if (a.groupId !== groupId) continue;
        sub += Number(a.device.dailyRate) * a.quantity * factor;
      }
      // Ad-hoc-Positionen: Stückpreis × Anzahl × Tagesfaktor (wie Geräte).
      // Bei Verkauf-Projekten ist der Faktor = 1.
      for (const it of project!.adHocItems) {
        if (it.groupId !== groupId) continue;
        sub += Number(it.unitPrice) * it.quantity * factor;
      }
    } else {
      for (const s of project!.services) {
        if (s.groupId !== groupId) continue;
        const price = s.unitPriceOverride
          ? Number(s.unitPriceOverride)
          : Number(s.serviceItem.unitPrice);
        sub += Number(s.quantity) * price;
      }
    }
    return sub;
  }
  /** Netto-Summe einer Gruppe (nach Gruppen-Rabatt). */
  function groupNet(groupId: string, kind: "MATERIAL" | "SERVICE"): number {
    const g = project!.groups.find((x) => x.id === groupId);
    if (!g) return 0;
    const sub = groupGross(groupId, kind);
    const pct = Number(g.discountPercent ?? 0) || 0;
    return sub - (sub * pct) / 100;
  }
  // Nicht-abrechenbare Gruppen werden komplett ausgeschlossen — sie fließen
  // weder in Subtotals noch in Rabatte ein.
  const materialNetAfterGroups = project.groups
    .filter((g) => g.kind === "MATERIAL" && g.billable)
    .reduce((s, g) => s + groupNet(g.id, "MATERIAL"), 0);
  const servicesNetAfterGroups = project.groups
    .filter((g) => g.kind === "SERVICE" && g.billable)
    .reduce((s, g) => s + groupNet(g.id, "SERVICE"), 0);

  const matPct = Number(project.materialDiscountPercent ?? 0) || 0;
  const svcPct = Number(project.servicesDiscountPercent ?? 0) || 0;
  const projPct = Number(project.discountPercent ?? 0) || 0;
  const materialBereichNet =
    materialNetAfterGroups - (materialNetAfterGroups * matPct) / 100;
  const servicesBereichNet =
    servicesNetAfterGroups - (servicesNetAfterGroups * svcPct) / 100;

  const subAfterBereichDiscounts = materialBereichNet + servicesBereichNet;
  const projectDiscountAmount = (subAfterBereichDiscounts * projPct) / 100;
  const total = subAfterBereichDiscounts - projectDiscountAmount;

  // Interne Zusatzkosten (Zumietung + Extrakosten) — fließen NICHT in die
  // obigen Erlössummen oder in Angebote/Rechnungen ein, dienen nur der
  // internen Gewinnkontrolle im Finanzen-Tab.
  const subhireTotal = project.subhires.reduce(
    (s, x) => s + Number(x.unitCost) * x.quantity,
    0
  );
  const extraPersonal = project.extraCosts
    .filter((c) => c.kind === "PERSONAL")
    .reduce((s, c) => s + Number(c.amount), 0);
  const extraOther = project.extraCosts
    .filter((c) => c.kind === "SONSTIGES")
    .reduce((s, c) => s + Number(c.amount), 0);
  // Gruppen der Kosten-Seite — EIN Typ für Zumietungen und Extrakosten.
  // Auch der Material-Tab braucht sie: der Zumiet-Dialog lässt die Kosten-Gruppe
  // dort direkt wählen.
  const costGroups = project.groups
    .filter((g) => g.kind === "COST")
    .map((g) => ({ id: g.id, name: g.name, billable: g.billable }));
  // ----- Überbuchungs-Prüfung: Einsätze derselben Personen in ANDEREN Projekten -----
  const projectPersonIds = [
    ...new Set(project.services.flatMap((s) => s.personAssignments.map((a) => a.personId))),
  ];
  const foreignAssignments =
    projectPersonIds.length > 0
      ? await prisma.personAssignment.findMany({
          where: {
            personId: { in: projectPersonIds },
            projectId: { not: id },
            // Stornierte Projekte blockieren niemanden.
            project: { is: { status: { not: "CANCELLED" } } },
          },
          select: {
            personId: true,
            plannedStart: true,
            plannedEnd: true,
            billingPeriod: { select: { start: true, end: true } },
            project: {
              select: { name: true, planningStart: true, planningEnd: true },
            },
          },
        })
      : [];
  // Fremd-Einsätze pro Person als effektive Zeitfenster (für Badge + Dialog).
  const personBusy: Record<
    string,
    { projectName: string; start: string; end: string; timed: boolean }[]
  > = {};
  for (const f of foreignAssignments) {
    const r = assignmentEffectiveRange({
      plannedStart: f.plannedStart,
      plannedEnd: f.plannedEnd,
      billingPeriod: f.billingPeriod,
      projectPlanningStart: f.project.planningStart,
      projectPlanningEnd: f.project.planningEnd,
    });
    (personBusy[f.personId] ??= []).push({
      projectName: f.project.name,
      start: r.start.toISOString(),
      end: r.end.toISOString(),
      timed: r.timed,
    });
  }
  // Konflikte je Einsatz dieses Projekts (Projektnamen der Überlappungen).
  const assignmentConflicts: Record<string, string[]> = {};
  for (const s of project.services) {
    for (const a of s.personAssignments) {
      const r = assignmentEffectiveRange({
        plannedStart: a.plannedStart,
        plannedEnd: a.plannedEnd,
        billingPeriod: a.billingPeriod,
        projectPlanningStart: project.planningStart,
        projectPlanningEnd: project.planningEnd,
      });
      const names = (personBusy[a.personId] ?? [])
        .filter((b) =>
          rangesOverlap(r.start, r.end, new Date(b.start), new Date(b.end))
        )
        .map((b) => b.projectName);
      if (names.length > 0) assignmentConflicts[a.id] = [...new Set(names)];
    }
  }

  // Einsatzplan-Zeilen für den Kosten-Tab: pro Einsatz Person, Position,
  // Vergütung und Stunden/Kosten — Ist-Zeiten, sonst geplante Stunden × Satz.
  const personnelEntries = project.services.flatMap((s) =>
    s.personAssignments.map((a) => {
      const loggedMinutes = a.timeEntries.reduce(
        (sum, e) => sum + workedMinutes(e),
        0
      );
      const timeCost = a.timeEntries.reduce(
        (sum, e) =>
          sum +
          timeEntryCost({
            startMinute: e.startMinute,
            endMinute: e.endMinute,
            breakMinutes: e.breakMinutes,
            hourlyWageSnapshot:
              e.hourlyWageSnapshot !== null ? Number(e.hourlyWageSnapshot) : null,
          }),
        0
      );
      const plannedMinutes = effectivePlannedMinutes({
        plannedStart: a.plannedStart,
        plannedEnd: a.plannedEnd,
        billingPeriod: a.billingPeriod,
        projectPlanningStart: project.planningStart,
        projectPlanningEnd: project.planningEnd,
      });
      const personHourlyWage =
        a.person.hourlyWage !== null ? Number(a.person.hourlyWage) : null;
      const eff = assignmentCost({
        agreedRate: a.agreedRate !== null ? Number(a.agreedRate) : null,
        hourlyRate: a.hourlyRate !== null ? Number(a.hourlyRate) : null,
        isMinijobber: a.person.employmentType === "MINIJOBBER",
        personHourlyWage,
        plannedMinutes,
        loggedMinutes,
        timeCost,
      });
      return {
        id: a.id,
        personName: a.person.name,
        employmentType: a.person.employmentType,
        serviceName: s.serviceItem.name,
        agreedRate: a.agreedRate !== null ? Number(a.agreedRate) : null,
        hourlyRate: a.hourlyRate !== null ? Number(a.hourlyRate) : null,
        personHourlyWage,
        loggedMinutes,
        timeCost,
        plannedMinutes,
        effMinutes: eff.minutes,
        effCost: eff.cost,
        effPlanned: eff.planned,
      };
    })
  );
  // Zeiten ohne Einsatz (z.B. nach Positions-Löschung oder Office-Erfassung).
  const orphanEntries = project.timeEntries.filter((e) => e.assignmentId === null);
  const orphanMinutes = orphanEntries.reduce((s, e) => s + workedMinutes(e), 0);
  const orphanTimeCost = orphanEntries.reduce(
    (s, e) =>
      s +
      timeEntryCost({
        startMinute: e.startMinute,
        endMinute: e.endMinute,
        breakMinutes: e.breakMinutes,
        hourlyWageSnapshot:
          e.hourlyWageSnapshot !== null ? Number(e.hourlyWageSnapshot) : null,
      }),
    0
  );
  // Personalkosten gesamt: pro Einsatz (Pauschale > Ist > geplant) + Zeiten
  // ohne Einsatz. Fließt in Gewinnrechnung, Kosten-Tab und Forecast.
  const personnelCost =
    personnelEntries.reduce((s, e) => s + e.effCost, 0) + orphanTimeCost;


  // Gewicht für die KPI-Card: Packeinheiten-Leergewicht inkl. der darin
  // liegenden Kabel (× Stück lt. Packliste) + lose Geräte + gebuchte Kabel.
  // Logik exakt wie auf der Packliste.
  const bookedDeviceIds = project.assignments.map((a) => a.deviceId);
  const projectPackUnits =
    bookedDeviceIds.length > 0
      ? await prisma.packUnit.findMany({
          where: {
            items: { some: { deviceId: { in: bookedDeviceIds } } },
          },
          include: {
            location: true,
            items: { include: { device: true } },
            cableItems: { include: { cable: true } },
          },
        })
      : [];
  const projectPackList = buildPackList(
    project.assignments.map((a) => ({
      deviceId: a.deviceId,
      quantity: a.quantity,
      device: { name: a.device.name, weight: a.device.weight },
    })),
    projectPackUnits.map((pu) => ({
      id: pu.id,
      code: pu.code,
      name: pu.name,
      packMode: pu.packMode,
      weight: pu.weight,
      location: pu.location ? { name: pu.location.name } : null,
      items: pu.items.map((it) => ({
        deviceId: it.deviceId,
        quantity: it.quantity,
        device: { name: it.device.name },
      })),
      cableItems: pu.cableItems.map((ci) => ({
        cableId: ci.cableId,
        quantity: ci.quantity,
        cable: ci.cable,
      })),
    })),
    project.cableAssignments.map((ca) => ({
      cableId: ca.cableId,
      quantity: ca.quantity,
      cable: ca.cable,
    }))
  );
  const totalWeightKg = projectPackList.reduce(
    (sum, item) => sum + item.weightPerUnit * item.quantity,
    0
  );

  // Scan-Fortschritt: pro Packlisten-Item zählen wir, wie viele Scans angekommen sind.
  // Auf Soll-Quantity gecapped — Über-Scans werden im Badge nicht weitergezählt.
  const scansByPackUnit = new Map<string, number>();
  const scansByDevice = new Map<string, number>();
  const scansByCable = new Map<string, number>();
  for (const s of project.packingScans) {
    if (s.packUnitId) {
      scansByPackUnit.set(s.packUnitId, (scansByPackUnit.get(s.packUnitId) ?? 0) + 1);
    } else if (s.deviceId) {
      scansByDevice.set(s.deviceId, (scansByDevice.get(s.deviceId) ?? 0) + 1);
    } else if (s.cableId) {
      scansByCable.set(s.cableId, (scansByCable.get(s.cableId) ?? 0) + 1);
    }
  }
  let scanTotalRequired = 0;
  let scanTotalDone = 0;
  for (const it of projectPackList) {
    scanTotalRequired += it.quantity;
    if (it.kind === "PACK") {
      scanTotalDone += Math.min(scansByPackUnit.get(it.packUnitId) ?? 0, it.quantity);
    } else if (it.kind === "CABLE") {
      scanTotalDone += Math.min(scansByCable.get(it.cableId) ?? 0, it.quantity);
    } else {
      scanTotalDone += Math.min(scansByDevice.get(it.deviceId) ?? 0, it.quantity);
    }
  }

  return (
    <div className="space-y-4">
      <DetailHeader
        backHref="/projects"
        title={project.name}
        badges={
          <>
            <Badge variant={projectStatusVariant(project.status)}>
              {projectStatusLabel(project.status)}
            </Badge>
            <Badge variant={projectKindVariant(project.kind)}>
              {projectKindLabel(project.kind)}
            </Badge>
          </>
        }
        subtitle={
          project.customer && (
            <Link
              href="/customers"
              className="hover:text-foreground hover:underline"
            >
              {project.customer.name}
            </Link>
          )
        }
        actions={
          <>
            {canWrite && (
              <CopyProjectButton
                id={project.id}
                name={project.name}
                planningStart={project.planningStart.toISOString()}
                planningEnd={project.planningEnd.toISOString()}
              />
            )}
            <DeleteProjectButton id={project.id} name={project.name} />
          </>
        }
      />

      <StatTileGrid>
        <StatTile
          label="Planung"
          size="sm"
          value={`${formatDate(project.planningStart)} – ${formatDate(project.planningEnd)}`}
          hint="blockt das Material"
        />
        <StatTile
          label="Berechnung"
          size="sm"
          tone="info"
          value={
            project.billingPeriods.length === 0
              ? "—"
              : `${formatDate(project.billingPeriods[0].start)} – ${formatDate(
                  project.billingPeriods[project.billingPeriods.length - 1].end
                )}`
          }
          hint={
            <>
              {billingDays} Tag(e) gesamt
              {project.billingPeriods.length > 1 &&
                ` · ${project.billingPeriods.length} Zeiträume`}
            </>
          }
        />
        <StatTile
          label="Gewicht"
          value={`${totalWeightKg.toFixed(1)} kg`}
          hint="Packeinheiten (leer, inkl. Kabel) + lose Geräte + Kabel"
        />
        <StatTile
          label="Gesamtpreis"
          value={formatCurrency(total)}
          hint={
            Number(project.discountPercent) > 0
              ? `inkl. ${project.discountPercent.toString()} % Rabatt`
              : undefined
          }
        />
      </StatTileGrid>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Details</span>
          </TabsTrigger>
          <TabsTrigger value="periods">
            <CalendarRange className="h-4 w-4" />
            <span className="hidden sm:inline">Zeiträume</span>
          </TabsTrigger>
          <TabsTrigger value="notes">
            <StickyNote className="h-4 w-4" />
            <span className="hidden sm:inline">Notizen</span>
          </TabsTrigger>
          <TabsTrigger value="files">
            <Paperclip className="h-4 w-4" />
            <span className="hidden sm:inline">Dateien</span>
          </TabsTrigger>
          <TabsTrigger value="material">
            <Boxes className="h-4 w-4" />
            <span className="hidden sm:inline">Material</span>
          </TabsTrigger>
          <TabsTrigger value="services">
            <Truck className="h-4 w-4" />
            <span className="hidden sm:inline">Personal & Transport</span>
          </TabsTrigger>
          <TabsTrigger value="costs">
            <HandCoins className="h-4 w-4" />
            <span className="hidden sm:inline">Zumietung & Kosten</span>
          </TabsTrigger>
          <TabsTrigger value="finances">
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">Finanzen</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <Card>
            <CardHeader><CardTitle>Stammdaten</CardTitle></CardHeader>
            <CardContent>
              <ProjectForm
                project={serialize(project)}
                customers={customers}
                users={users}
                billingPeriods={serialize(project.billingPeriods)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="periods">
          <PeriodsSection
            projectId={project.id}
            planningStart={project.planningStart.toISOString()}
            planningEnd={project.planningEnd.toISOString()}
            billingPeriods={project.billingPeriods.map((p) => ({
              id: p.id,
              start: p.start.toISOString(),
              end: p.end.toISOString(),
              notes: p.notes,
            }))}
          />
        </TabsContent>

        <TabsContent value="notes">
          <NotesSection
            projectId={project.id}
            notes={project.projectNotes.map((n) => ({
              id: n.id,
              title: n.title,
              content: n.content,
              updatedAt: n.updatedAt.toISOString(),
            }))}
            people={users.map((u) => ({ id: u.id, name: userLabel(u) }))}
            canWrite={canWrite}
          />
        </TabsContent>

        <TabsContent value="files">
          <FilesSection
            projectId={project.id}
            canWrite={canWrite}
            files={project.files.map((f) => ({
              id: f.id,
              name: f.name,
              mimeType: f.mimeType,
              sizeBytes: f.sizeBytes,
              blobUrl: f.blobUrl,
              uploadedAt: f.uploadedAt.toISOString(),
              uploadedBy: f.uploadedBy
                ? { name: f.uploadedBy.name, email: f.uploadedBy.email }
                : null,
            }))}
          />
        </TabsContent>

        <TabsContent value="material">
          <AssignmentsSection
            project={serialize(project)}
            allDevices={serialize(allDevices)}
            allCables={serialize(allCables)}
            cableAssignments={serialize(project.cableAssignments)}
            cableConflictMap={cableConflictMap}
            conflictMap={serialize(conflictMap)}
            reservedDeviceIds={Array.from(reservedDeviceIds)}
            billingDays={billingDays}
            billingFactor={billingFactor}
            groupDays={groupDays}
            groupFactors={groupFactors}
            billingPeriods={project.billingPeriods.map((p) => ({
              id: p.id,
              start: p.start.toISOString(),
              end: p.end.toISOString(),
              notes: p.notes,
            }))}
            groupPeriodIds={groupPeriodIds}
            subtotal={materialSubtotal}
            discount={materialSubtotal - materialBereichNet}
            total={materialBereichNet}
            groups={serialize(project.groups.filter((g) => g.kind === "MATERIAL"))}
            adHocItems={serialize(project.adHocItems)}
            groupComments={serialize(project.groupComments)}
            categories={serialize(allCategories)}
            scanProgress={{ packed: scanTotalDone, total: scanTotalRequired }}
            isSale={isSale}
            subhires={project.subhires.map((s) => ({
              id: s.id,
              deviceId: s.deviceId,
              adHocItemId: s.adHocItemId,
              groupId: s.groupId,
              costGroupId: s.costGroupId,
              name: s.name,
              supplier: s.supplier,
              quantity: s.quantity,
              unitCost: Number(s.unitCost),
              notes: s.notes,
            }))}
            costGroups={costGroups}
          />
        </TabsContent>

        <TabsContent value="services">
          <ServicesSection
            projectId={project.id}
            projectServices={project.services.map((s) => ({
              id: s.id,
              serviceItemId: s.serviceItemId,
              groupId: s.groupId,
              quantity: Number(s.quantity),
              unitPriceOverride:
                s.unitPriceOverride !== null ? Number(s.unitPriceOverride) : null,
              notes: s.notes,
              sortOrder: s.sortOrder,
              serviceItem: {
                id: s.serviceItem.id,
                name: s.serviceItem.name,
                kind: s.serviceItem.kind,
                unit: s.serviceItem.unit,
                unitPrice: Number(s.serviceItem.unitPrice),
                active: s.serviceItem.active,
              },
              personAssignments: s.personAssignments.map((a) => ({
                id: a.id,
                personId: a.personId,
                personName: a.person.name,
                employmentType: a.person.employmentType,
                billingPeriodId: a.billingPeriodId,
                periodStart: a.billingPeriod?.start.toISOString() ?? null,
                periodEnd: a.billingPeriod?.end.toISOString() ?? null,
                periodNotes: a.billingPeriod?.notes ?? null,
                plannedStart: a.plannedStart?.toISOString() ?? null,
                plannedEnd: a.plannedEnd?.toISOString() ?? null,
                agreedRate: a.agreedRate !== null ? Number(a.agreedRate) : null,
                hourlyRate: a.hourlyRate !== null ? Number(a.hourlyRate) : null,
                invoiceReceived: a.invoiceReceived,
                notes: a.notes,
                loggedMinutes: a.timeEntries.reduce(
                  (sum, e) => sum + workedMinutes(e),
                  0
                ),
                plannedMinutes: effectivePlannedMinutes({
                  plannedStart: a.plannedStart,
                  plannedEnd: a.plannedEnd,
                  billingPeriod: a.billingPeriod,
                  projectPlanningStart: project.planningStart,
                  projectPlanningEnd: project.planningEnd,
                }),
                conflicts: assignmentConflicts[a.id] ?? [],
              })),
            }))}
            catalog={serialize(serviceCatalog) as never}
            groups={serialize(project.groups.filter((g) => g.kind === "SERVICE"))}
            groupComments={serialize(project.groupComments)}
            persons={activePersons.map((p) => ({
              id: p.id,
              name: p.name,
              employmentType: p.employmentType,
              hourlyWage: p.hourlyWage !== null ? Number(p.hourlyWage) : null,
              defaultDayRate:
                p.defaultDayRate !== null ? Number(p.defaultDayRate) : null,
            }))}
            billingPeriods={project.billingPeriods.map((p) => ({
              id: p.id,
              start: p.start.toISOString(),
              end: p.end.toISOString(),
              notes: p.notes,
            }))}
            groupPeriodIds={groupPeriodIds}
            personBusy={personBusy}
            planningStartIso={project.planningStart.toISOString()}
            planningEndIso={project.planningEnd.toISOString()}
          />
        </TabsContent>

        <TabsContent value="costs">
          <CostsSection
            projectId={project.id}
            subhires={project.subhires.map((s) => ({
              id: s.id,
              deviceId: s.deviceId,
              adHocItemId: s.adHocItemId,
              groupId: s.groupId,
              costGroupId: s.costGroupId,
              costSortOrder: s.costSortOrder,
              name: s.name,
              supplier: s.supplier,
              quantity: s.quantity,
              unitCost: Number(s.unitCost),
              notes: s.notes,
            }))}
            extraCosts={project.extraCosts.map((c) => ({
              id: c.id,
              groupId: c.groupId,
              sortOrder: c.sortOrder,
              label: c.label,
              kind: c.kind,
              amount: Number(c.amount),
              notes: c.notes,
            }))}
            devices={allDevices.map((d) => ({
              id: d.id,
              name: d.name,
              manufacturer: d.manufacturer,
              model: d.model,
            }))}
            adHocItems={project.adHocItems.map((it) => ({
              id: it.id,
              name: it.name,
            }))}
            materialGroups={project.groups
              .filter((g) => g.kind === "MATERIAL")
              .map((g) => ({ id: g.id, name: g.name }))}
            costGroups={costGroups}
            groupComments={project.groupComments.map((c) => ({
              id: c.id,
              groupId: c.groupId,
              text: c.text,
              sortOrder: c.sortOrder,
            }))}
            personnelCost={personnelCost}
            personnelEntries={personnelEntries}
            orphanTime={{ minutes: orphanMinutes, cost: orphanTimeCost }}
          />
        </TabsContent>

        <TabsContent value="finances">
          <FinancesSection
            projectId={project.id}
            projectName={project.name}
            groups={project!.groups
              .filter((g) => g.kind === "MATERIAL" || g.kind === "SERVICE")
              .map((g) => ({
                id: g.id,
                name: g.name,
                kind: g.kind as "MATERIAL" | "SERVICE",
                discountPercent: Number(g.discountPercent ?? 0),
                // BRUTTO der Gruppe — Gruppen-Rabatt wird in der UI erneut
                // angewandt und muss daher hier raus, sonst doppelt rabattiert.
                subtotal: groupGross(g.id, g.kind as "MATERIAL" | "SERVICE"),
                billable: g.billable,
              }))}
            projectDiscountPercent={projPct}
            materialDiscountPercent={matPct}
            servicesDiscountPercent={svcPct}
            invoices={project.invoices.map((inv) => ({
              id: inv.id,
              number: inv.number,
              kind: inv.kind,
              reminderLevel: inv.reminderLevel,
              isPrepayment: inv.isPrepayment,
              date: inv.date.toISOString(),
              dueDate: inv.dueDate.toISOString(),
              totalNet: Number(inv.totalNet),
              totalGross: inv.totalGross !== null ? Number(inv.totalGross) : null,
              paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
              prepaymentPercent:
                inv.prepaymentPercent !== null ? Number(inv.prepaymentPercent) : null,
              isFinal: inv.deductions !== null && inv.deductions !== undefined,
              emailSentAt: inv.emailSentAt ? inv.emailSentAt.toISOString() : null,
              emailSentTo: inv.emailSentTo,
            }))}
            quotes={project.quotes.map((q) => ({
              id: q.id,
              number: q.number,
              date: q.date.toISOString(),
              expiresAt: q.expiresAt.toISOString(),
              totalNet: Number(q.totalNet),
              totalGross: q.totalGross !== null ? Number(q.totalGross) : null,
              acceptedAt: q.acceptedAt ? q.acceptedAt.toISOString() : null,
              acceptedByName: q.acceptedByName,
              supersededByQuoteId: q.supersededByQuoteId,
              emailSentAt: q.emailSentAt ? q.emailSentAt.toISOString() : null,
              emailSentTo: q.emailSentTo,
            }))}
            invoiceDueDays={Number(appSettings.invoiceDueDays) || 7}
            quoteValidityDays={Number(appSettings.quoteValidityDays) || 14}
            subhireTotal={subhireTotal}
            extraPersonal={extraPersonal}
            extraOther={extraOther}
            personnelCost={personnelCost}
            customerEmail={project.customer?.email ?? null}
            customerName={project.customer?.name ?? null}
            currentUserEmail={session?.user.email ?? ""}
            quoteEmailSubjectTemplate={appSettings.quoteEmailSubject}
            quoteEmailBodyTemplate={appSettings.quoteEmailBody}
            invoiceEmailSubjectTemplate={appSettings.invoiceEmailSubject}
            invoiceEmailBodyTemplate={appSettings.invoiceEmailBody}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
