import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, FileText, Boxes, StickyNote, Truck, CalendarRange, Wallet } from "lucide-react";
import { formatCurrency, formatDate, daysBetween, serialize } from "@/lib/utils";
import { projectStatusLabel, projectStatusVariant } from "@/lib/labels";
import { ProjectForm } from "../project-form";
import { AssignmentsSection } from "./assignments-section";
import { NotesSection } from "./notes-section";
import { PeriodsSection } from "./periods-section";
import { ServicesSection } from "./services-section";
import { FinancesSection } from "./finances-section";
import { DeleteProjectButton } from "./delete-button";
import { PdfExportButtons } from "./pdf-export";
import { getOverlappingAssignments } from "@/lib/availability";
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
        services: {
          include: { serviceItem: true },
          orderBy: [{ serviceItem: { kind: "asc" } }, { serviceItem: { name: "asc" } }],
        },
        assignments: {
          include: {
            packUnit: {
              include: {
                items: { include: { device: { include: { category: true } } } },
              },
            },
          },
          orderBy: { packUnit: { code: "asc" } },
        },
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

  const [allPackUnits, customers] = await Promise.all([
    prisma.packUnit.findMany({
      include: {
        items: { include: { device: true } },
        location: true,
        category: true,
      },
      orderBy: { code: "asc" },
    }),
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
  ]);

  const overlap = await getOverlappingAssignments(
    project.assignments.map((a) => a.packUnitId),
    project.planningStart,
    project.planningEnd
  );

  type OtherProject = {
    projectId: string;
    projectName: string;
    planningStart: Date;
    planningEnd: Date;
    quantity: number;
  };
  type StockInfo = { totalDemand: number; otherProjects: OtherProject[] };
  const conflictMap: Record<string, StockInfo> = {};
  for (const o of overlap) {
    const entry = (conflictMap[o.packUnitId] ??= { totalDemand: 0, otherProjects: [] });
    entry.totalDemand += o.quantity;
    if (o.projectId !== project.id) {
      entry.otherProjects.push({
        projectId: o.project.id,
        projectName: o.project.name,
        planningStart: o.project.planningStart,
        planningEnd: o.project.planningEnd,
        quantity: o.quantity,
      });
    }
  }

  const billingDays = project.billingPeriods.reduce(
    (sum, p) => sum + daysBetween(p.start, p.end),
    0
  );

  function packUnitRate(items: { device: { dailyRate: { toString(): string } }; quantity: number }[]) {
    return items.reduce(
      (s, it) => s + Number(it.device.dailyRate) * it.quantity,
      0
    );
  }

  const materialSubtotal = project.assignments.reduce((sum, a) => {
    const rate = packUnitRate(a.packUnit.items);
    return sum + rate * a.quantity * billingDays;
  }, 0);

  const servicesSubtotal = project.services.reduce((sum, s) => {
    const price = s.unitPriceOverride
      ? Number(s.unitPriceOverride)
      : Number(s.serviceItem.unitPrice);
    return sum + Number(s.quantity) * price;
  }, 0);

  function groupNet(groupId: string, kind: "MATERIAL" | "SERVICE"): number {
    const g = project!.groups.find((x) => x.id === groupId);
    if (!g) return 0;
    let sub = 0;
    if (kind === "MATERIAL") {
      for (const a of project!.assignments) {
        if (a.groupId !== groupId) continue;
        sub += packUnitRate(a.packUnit.items) * a.quantity * billingDays;
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
    const pct = Number(g.discountPercent ?? 0) || 0;
    return sub - (sub * pct) / 100;
  }
  const materialNetAfterGroups = project.groups
    .filter((g) => g.kind === "MATERIAL")
    .reduce((s, g) => s + groupNet(g.id, "MATERIAL"), 0);
  const servicesNetAfterGroups = project.groups
    .filter((g) => g.kind === "SERVICE")
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

  const deviceCount = project.assignments.reduce(
    (s, a) =>
      s + a.packUnit.items.reduce((ds, it) => ds + it.quantity, 0) * a.quantity,
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/projects"><ArrowLeft className="h-4 w-4" /> Zurück</Link>
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
            <Badge variant={projectStatusVariant(project.status)}>
              {projectStatusLabel(project.status)}
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
        <div className="flex gap-2">
          <PdfExportButtons projectId={project.id} />
          <DeleteProjectButton id={project.id} name={project.name} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
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
          <CardHeader className="pb-2"><CardDescription>Material</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{project.assignments.length}</div>
            <div className="text-xs text-muted-foreground">
              Packeinheiten · {deviceCount} Geräte
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
          <TabsTrigger value="details"><FileText className="h-4 w-4" /> Details</TabsTrigger>
          <TabsTrigger value="periods"><CalendarRange className="h-4 w-4" /> Zeiträume</TabsTrigger>
          <TabsTrigger value="notes"><StickyNote className="h-4 w-4" /> Notizen</TabsTrigger>
          <TabsTrigger value="material"><Boxes className="h-4 w-4" /> Material</TabsTrigger>
          <TabsTrigger value="services"><Truck className="h-4 w-4" /> Personal & Transport</TabsTrigger>
          <TabsTrigger value="finances"><Wallet className="h-4 w-4" /> Finanzen</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <Card>
            <CardHeader><CardTitle>Projekt bearbeiten</CardTitle></CardHeader>
            <CardContent>
              <ProjectForm
                project={serialize(project)}
                customers={customers}
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

        <TabsContent value="material">
          <AssignmentsSection
            project={serialize(project)}
            allPackUnits={serialize(allPackUnits)}
            conflictMap={serialize(conflictMap)}
            billingDays={billingDays}
            subtotal={subtotal}
            discount={discount}
            total={total}
            groups={serialize(project.groups)}
          />
        </TabsContent>

        <TabsContent value="services">
          <ServicesSection
            projectId={project.id}
            projectServices={serialize(project.services)}
            catalog={serialize(serviceCatalog)}
            groups={serialize(project.groups)}
          />
        </TabsContent>

        <TabsContent value="finances">
          <FinancesSection
            projectId={project.id}
            projectName={project.name}
            groups={serialize(project.groups)}
            projectDiscountPercent={projPct}
            materialDiscountPercent={matPct}
            servicesDiscountPercent={svcPct}
            invoices={project.invoices.map((inv) => ({
              id: inv.id,
              number: inv.number,
              date: inv.date.toISOString(),
              dueDate: inv.dueDate.toISOString(),
              totalNet: Number(inv.totalNet),
              totalGross: inv.totalGross !== null ? Number(inv.totalGross) : null,
              paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
            }))}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
