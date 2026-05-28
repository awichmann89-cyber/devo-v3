import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, FileText, Boxes } from "lucide-react";
import { formatCurrency, formatDate, daysBetween, serialize } from "@/lib/utils";
import { projectStatusLabel, projectStatusVariant } from "@/lib/labels";
import { ProjectForm } from "../project-form";
import { AssignmentsSection } from "./assignments-section";
import { DeleteProjectButton } from "./delete-button";
import { PdfExportButtons } from "./pdf-export";
import { getOverlappingAssignments } from "@/lib/availability";

export default async function ProjectDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
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
  });
  if (!project) notFound();

  const allPackUnits = await prisma.packUnit.findMany({
    include: {
      items: { include: { device: true } },
      location: true,
    },
    orderBy: { code: "asc" },
  });

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

  const billingDays = daysBetween(project.billingStart, project.billingEnd);

  // Tagespreis pro Packeinheit = Summe(Inhalt × Anzahl × dailyRate)
  function packUnitRate(items: { device: { dailyRate: { toString(): string } }; quantity: number }[]) {
    return items.reduce(
      (s, it) => s + Number(it.device.dailyRate) * it.quantity,
      0
    );
  }

  const subtotal = project.assignments.reduce((sum, a) => {
    const rate = packUnitRate(a.packUnit.items);
    return sum + rate * a.quantity * billingDays;
  }, 0);
  const discount = (subtotal * Number(project.discountPercent)) / 100;
  const total = subtotal - discount;

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
          {project.customer && <p className="text-muted-foreground">{project.customer}</p>}
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
            <div className="text-sm font-medium">{formatDate(project.billingStart)}</div>
            <div className="text-xs text-muted-foreground">{billingDays} Tag(e)</div>
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

      <Tabs defaultValue="material">
        <TabsList>
          <TabsTrigger value="material"><Boxes className="h-4 w-4" /> Packeinheiten</TabsTrigger>
          <TabsTrigger value="details"><FileText className="h-4 w-4" /> Details</TabsTrigger>
        </TabsList>

        <TabsContent value="material" className="space-y-4">
          <AssignmentsSection
            project={serialize(project)}
            allPackUnits={serialize(allPackUnits)}
            conflictMap={serialize(conflictMap)}
            billingDays={billingDays}
            subtotal={subtotal}
            discount={discount}
            total={total}
          />
        </TabsContent>

        <TabsContent value="details">
          <Card>
            <CardHeader><CardTitle>Projekt bearbeiten</CardTitle></CardHeader>
            <CardContent>
              <ProjectForm project={serialize(project)} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
