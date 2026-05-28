import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, FolderKanban, Boxes, AlertTriangle } from "lucide-react";
import { ProjectStatus, DeviceStatus } from "@prisma/client";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export default async function DashboardPage() {
  const [deviceCount, projectCount, packUnitCount, defectCount, upcomingProjects, activeProjects] =
    await Promise.all([
      prisma.device.count(),
      prisma.project.count(),
      prisma.packUnit.count(),
      prisma.device.count({ where: { status: DeviceStatus.DEFECT } }),
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Übersicht über Material und laufende Projekte</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard href="/material?tab=pack-units" title="Packeinheiten" value={packUnitCount} icon={Boxes} />
        <StatCard href="/material?tab=devices" title="Geräte-Typen" value={deviceCount} icon={Package} />
        <StatCard href="/projects" title="Projekte" value={projectCount} icon={FolderKanban} />
        <StatCard
          href="/material?tab=devices"
          title="Defekt"
          value={defectCount}
          icon={AlertTriangle}
          variant={defectCount > 0 ? "warning" : "default"}
        />
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
                <Badge variant="outline">{p.status}</Badge>
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
                <Badge>{p.status}</Badge>
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
      <Card className="transition-colors hover:bg-accent">
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Icon className={variant === "warning" ? "h-4 w-4 text-yellow-500" : "h-4 w-4 text-muted-foreground"} />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{value}</div>
        </CardContent>
      </Card>
    </Link>
  );
}
