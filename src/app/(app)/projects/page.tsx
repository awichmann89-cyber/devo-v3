import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectsTable } from "./projects-table";
import { ProjectDialog } from "./project-dialog";
import { auth } from "@/auth";

export default async function ProjectsPage() {
  const [projects, customers, users, session] = await Promise.all([
    prisma.project.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        kind: true,
        planningStart: true,
        planningEnd: true,
        customer: { select: { name: true } },
        maintainer: { select: { name: true, email: true } },
        billingPeriods: {
          select: { start: true, end: true },
          orderBy: { start: "asc" },
        },
        _count: { select: { assignments: true } },
      },
      orderBy: { planningStart: "asc" },
    }),
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    auth(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Projekte</h1>
          <p className="text-muted-foreground">Veranstaltungen und Vermietungen</p>
        </div>
        <ProjectDialog
          customers={customers}
          users={users}
          currentUserId={session?.user.id ?? null}
        />
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
