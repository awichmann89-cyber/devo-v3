import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, FileText, Boxes, StickyNote, Truck } from "lucide-react";
import { formatCurrency, formatDate, daysBetween, serialize } from "@/lib/utils";
import { projectStatusLabel, projectStatusVariant } from "@/lib/labels";
import { ProjectForm } from "../project-form";
import { AssignmentsSection } from "./assignments-section";
import { NotesSection } from "./notes-section";
import { ServicesSection } from "./services-section";
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

  // Konflikte (überlappende Buchungen, inkl. eigene)
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

  // Tage über alle Berechnungszeiträume aufsummieren
  const billingDays = project.billingPeriods.reduce(
    (sum, p) => sum + daysBetween(p.start, p.end),
    0
  );

  // Tagespreis pro Packeinheit = Summe(Inhalt × Anzahl × dailyRate)
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

  // Personal- und Transport-Positionen aufsummieren
  const servicesSubtotal = project.services.reduce((sum, s) => {
    const price = s.unitPriceOverride
      ? Number(s.unitPriceOverride)
      : Number(s.serviceItem.unitPrice);
    return sum + Number(s.quantity) * price;
  }, 0);

  const subtotal = materialSubtotal + servicesSubtotal;
  const discount = (subtotal * Number(project.discountPercent)) / 100;
  const total = subtotal - discount;

  // Anteilige Beträge für die Material-Karte (verteilt den Rabatt anteilig)
  const materialDiscount =
    (materialSubtotal * Number(project.discountPercent)) / 100;
  const materialTotal = materialSubtotal - materialDiscount;

  // Geräte-Aggregat für Kennzahl
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
            <div className="text-sm font-medium">{formatDate(project.planningStart)}</div>
            <div className="text-xs text-muted-foreground">bis {formatDate(project.planningEnd)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Berechnung</CardDescription></CardHeader>
          <CardContent>
            <div className="text-sm font-medium">
              {project.billingPeriods.length === 1
                ? formatDate(project.billingPeriods[0].start)
                : `${project.billingPeriods.length} Zeiträume`}
            </div>
            <div className="text-xs text-muted-foreground">{billingDays} Tag(e) gesamt</div>
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
          <TabsTrigger value="notes">
            <StickyNote className="h-4 w-4" /> Notizen
            {project.projectNotes.length > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 text-[10px]">
                {project.projectNotes.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="material"><Boxes className="h-4 w-4" /> Material</TabsTrigger>
          <TabsTrigger value="services">
            <Truck className="h-4 w-4" /> Personal & Transport
            {project.services.length > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 text-[10px]">
                {project.services.length}
              </Badge>
            )}
          </TabsTrigger>
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

        <TabsContent value="material" className="space-y-4">
          <AssignmentsSection
            project={serialize(project)}
            allPackUnits={serialize(allPackUnits)}
            conflictMap={serialize(conflictMap)}
            billingDays={billingDays}
            subtotal={materialSubtotal}
            discount={materialDiscount}
            total={materialTotal}
            groups={project.groups.filter((g) => g.kind === "MATERIAL")}
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
                s.unitPriceOverride === null ? null : Number(s.unitPriceOverride),
              notes: s.notes,
              serviceItem: {
                id: s.serviceItem.id,
                name: s.serviceItem.name,
                kind: s.serviceItem.kind,
                unit: s.serviceItem.unit,
                unitPrice: Number(s.serviceItem.unitPrice),
                active: s.serviceItem.active,
              },
            }))}
            catalog={serviceCatalog.map((c) => ({
              id: c.id,
              name: c.name,
              description: c.description,
              kind: c.kind,
              unit: c.unit,
              unitPrice: Number(c.unitPrice),
              active: c.active,
            }))}
            groups={project.groups.filter((g) => g.kind === "SERVICE")}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
