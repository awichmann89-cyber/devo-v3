import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, FolderKanban, Boxes } from "lucide-react";
import { ProjectStatus } from "@prisma/client";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { projectStatusLabel, projectStatusVariant } from "@/lib/labels";

export default async function DashboardPage() {
  const [deviceCount, projectCount, packUnitCount, upcomingProjects, activeProjects] =
    await Promise.all([
      prisma.device.count(),
      prisma.project.count(),
      prisma.packUnit.count(),
      prisma.project.findMany({
        where: {
          status: { in: [ProjectStatus.CONFIRMED, ProjectStatus.DRAFT] },
          planningStart: { gte: new Date() },
        },
        orderBy: { planningStart: "asc" },
        take: 5,
      }),
      prisma.project.findMany({
        where: {
          status: ProjectStatus.ACTIVE,
        },
        orderBy: { planningEnd: "asc" },
        take: 5,
      }),
    ]);

  return (
    <div className="space-y-6">

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard href="/material?tab=pack-units" title="Packeinheiten" value={packUnitCount} icon={Boxes} />
        <StatCard href="/material?tab=devices" title="Geräte-Typen" value={deviceCount} icon={Package} />
        <StatCard href="/projects" title="Projekte" value={projectCount} icon={FolderKanban} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Anstehende Projekte</CardTitle>
            <CardDescription>Geplant oder bestätigt</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingProjects.length === 0 && (
              <p className="text-sm text-muted-foreground">Keine anstehenden Projekte</p>
            )}
            {upcomingProjects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex items-center justify-between rounded-md border p-3 hover:bg-accent"
              >
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(p.planningStart)} – {formatDate(p.planningEnd)}
                  </div>
                </div>
                <Badge variant={projectStatusVariant(p.status)}>{projectStatusLabel(p.status)}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aktive Projekte</CardTitle>
            <CardDescription>Laufen aktuell</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeProjects.length === 0 && (
              <p className="text-sm text-muted-foreground">Keine aktiven Projekte</p>
            )}
            {activeProjects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex items-center justify-between rounded-md border p-3 hover:bg-accent"
              >
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    bis {formatDate(p.planningEnd)}
                  </div>
                </div>
                <Badge variant={projectStatusVariant(p.status)}>{projectStatusLabel(p.status)}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  href,
  title,
  value,
  icon: Icon,
  variant = "default",
}: {
  href: string;
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "default" | "warning";
}) {
  return (
    <Link href={href}>
      {/* Redesign: Akzentbalken links, Label gedämpft, große Zahl */}
      <Card className="relative overflow-hidden transition-colors hover:border-primary">
        <div className="absolute left-0 top-0 h-full w-[3px] bg-primary opacity-85" aria-hidden />
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-1">
          <CardTitle className="text-xs font-semibold text-muted-foreground">{title}</CardTitle>
          <Icon className={variant === "warning" ? "h-4 w-4 text-warning" : "h-4 w-4 text-primary"} />
        </CardHeader>
        <CardContent>
          <div className="text-[27px] font-extrabold leading-none tracking-tight">{value}</div>
        </CardContent>
      </Card>
    </Link>
  );
}
