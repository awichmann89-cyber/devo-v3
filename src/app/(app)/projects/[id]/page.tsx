import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, FileText, Boxes, StickyNote, Truck, CalendarRange, Wallet, Paperclip, HandCoins } from "lucide-react";
import { formatCurrency, formatDate, daysBetween, serialize } from "@/lib/utils";
import {
  projectKindLabel,
  projectKindVariant,
  projectStatusLabel,
  projectStatusVariant,
} from "@/lib/labels";
import { getSettings, parseDayFactorMap, getDayFactor } from "@/lib/settings";
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
        groups: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] },
        invoices: { orderBy: { date: "desc" } },
        quotes: { orderBy: { date: "desc" } },
        services: {
          include: { serviceItem: true },
          orderBy: { sortOrder: "asc" },
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
          select: { id: true, packUnitId: true, deviceId: true },
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

  const [allDevices, allCables, allCategories, customers, users] = await Promise.all([
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

  const materialSubtotal =
    project.assignments.reduce((sum, a) => {
      return sum + Number(a.device.dailyRate) * a.quantity * billingFactor;
    }, 0) +
    project.adHocItems.reduce(
      (sum, it) => sum + Number(it.unitPrice) * it.quantity * billingFactor,
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
      for (const a of project!.assignments) {
        if (a.groupId !== groupId) continue;
        sub += Number(a.device.dailyRate) * a.quantity * billingFactor;
      }
      // Ad-hoc-Positionen: Stückpreis × Anzahl × Tagesfaktor (wie Geräte).
      // Bei Verkauf-Projekten ist billingFactor = 1.
      for (const it of project!.adHocItems) {
        if (it.groupId !== groupId) continue;
        sub += Number(it.unitPrice) * it.quantity * billingFactor;
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
  const subtotal = materialSubtotal + servicesSubtotal;
  const total = subAfterBereichDiscounts - projectDiscountAmount;
  const discount = subtotal - total;

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

  const deviceCount = project.assignments.reduce(
    (s, a) => s + a.quantity,
    0
  );

  // Gewicht für die KPI-Card: Packeinheiten-Leergewicht (× Stück lt. Packliste)
  // + Gewicht der losen Geräte. Logik exakt wie auf der Packliste.
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
        cable: { name: ci.cable.name },
      })),
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
  for (const s of project.packingScans) {
    if (s.packUnitId) {
      scansByPackUnit.set(s.packUnitId, (scansByPackUnit.get(s.packUnitId) ?? 0) + 1);
    } else if (s.deviceId) {
      scansByDevice.set(s.deviceId, (scansByDevice.get(s.deviceId) ?? 0) + 1);
    }
  }
  let scanTotalRequired = 0;
  let scanTotalDone = 0;
  for (const it of projectPackList) {
    scanTotalRequired += it.quantity;
    if (it.kind === "PACK") {
      scanTotalDone += Math.min(scansByPackUnit.get(it.packUnitId) ?? 0, it.quantity);
    } else {
      scanTotalDone += Math.min(scansByDevice.get(it.deviceId) ?? 0, it.quantity);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/projects"><ArrowLeft className="h-4 w-4" /> Zurück</Link>
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h1 className="text-[21px] font-extrabold tracking-tight">
              {project.name}
            </h1>
            <Badge variant={projectStatusVariant(project.status)}>
              {projectStatusLabel(project.status)}
            </Badge>
            <Badge variant={projectKindVariant(project.kind)}>
              {projectKindLabel(project.kind)}
            </Badge>
          </div>
          {project.customer && (
            <Link
              href="/customers"
              className="text-muted-foreground hover:underline hover:text-foreground"
            >
              {project.customer.name}
            </Link>
          )}
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          {canWrite && (
            <CopyProjectButton
              id={project.id}
              name={project.name}
              planningStart={project.planningStart.toISOString()}
              planningEnd={project.planningEnd.toISOString()}
            />
          )}
          <DeleteProjectButton id={project.id} name={project.name} />
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Planung</CardDescription></CardHeader>
          <CardContent>
            <div className="text-sm font-medium">
              {formatDate(project.planningStart)} bis {formatDate(project.planningEnd)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Berechnung</CardDescription></CardHeader>
          <CardContent>
            <div className="text-sm font-medium">
              {project.billingPeriods.length === 0
                ? "—"
                : project.billingPeriods.length === 1
                ? `${formatDate(project.billingPeriods[0].start)} bis ${formatDate(project.billingPeriods[0].end)}`
                : `${formatDate(project.billingPeriods[0].start)} bis ${formatDate(
                    project.billingPeriods[project.billingPeriods.length - 1].end
                  )}`}
            </div>
            <div className="text-xs text-muted-foreground">
              {billingDays} Tag(e) gesamt
              {project.billingPeriods.length > 1 &&
                ` · ${project.billingPeriods.length} Zeiträume`}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Gewicht</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {totalWeightKg.toFixed(1)} kg
            </div>
            <div className="text-xs text-muted-foreground">
              Packeinheiten (leer) + lose Geräte
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Gesamtpreis</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(total)}</div>
            {Number(project.discountPercent) > 0 && (
              <div className="text-xs text-muted-foreground">
                inkl. {project.discountPercent.toString()}% Rabatt
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
            <CardHeader><CardTitle>Projekt bearbeiten</CardTitle></CardHeader>
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
            subtotal={subtotal}
            discount={discount}
            total={total}
            groups={serialize(project.groups.filter((g) => g.kind === "MATERIAL"))}
            cableGroups={serialize(project.groups.filter((g) => g.kind === "CABLE"))}
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
              name: s.name,
              supplier: s.supplier,
              quantity: s.quantity,
              unitCost: Number(s.unitCost),
            }))}
          />
        </TabsContent>

        <TabsContent value="services">
          <ServicesSection
            projectId={project.id}
            projectServices={serialize(project.services) as never}
            catalog={serialize(serviceCatalog) as never}
            groups={serialize(project.groups.filter((g) => g.kind === "SERVICE"))}
            groupComments={serialize(project.groupComments)}
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
              name: s.name,
              supplier: s.supplier,
              quantity: s.quantity,
              unitCost: Number(s.unitCost),
            }))}
            extraCosts={project.extraCosts.map((c) => ({
              id: c.id,
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
            groups={project.groups
              .filter((g) => g.kind === "MATERIAL")
              .map((g) => ({ id: g.id, name: g.name }))}
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
            }))}
            invoiceDueDays={Number(appSettings.invoiceDueDays) || 7}
            quoteValidityDays={Number(appSettings.quoteValidityDays) || 14}
            subhireTotal={subhireTotal}
            extraPersonal={extraPersonal}
            extraOther={extraOther}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
