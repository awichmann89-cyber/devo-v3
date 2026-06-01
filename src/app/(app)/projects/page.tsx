import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectsTable } from "./projects-table";
import { ProjectDialog } from "./project-dialog";

export default async function ProjectsPage() {
  const [projects, customers] = await Promise.all([
    prisma.project.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        planningStart: true,
        planningEnd: true,
        customer: { select: { name: true } },
        billingPeriods: {
          select: { start: true, end: true },
          orderBy: { start: "asc" },
        },
        _count: { select: { assignments: true } },
      },
      orderBy: { planningStart: "desc" },
    }),
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projekte</h1>
          <p className="text-muted-foreground">Veranstaltungen und Vermietungen</p>
        </div>
        <ProjectDialog customers={customers} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{projects.length} Projekte</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectsTable projects={projects} />
        </CardContent>
      </Card>
    </div>
  );
}
