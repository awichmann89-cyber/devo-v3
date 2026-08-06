import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile, StatTileGrid } from "@/components/ui/stat-tile";
import { Package, FolderKanban, Boxes, CalendarClock, Activity } from "lucide-react";
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
    <div className="space-y-4">
      <StatTileGrid className="lg:grid-cols-3">
        <StatTile
          label="Packeinheiten"
          value={packUnitCount}
          icon={Boxes}
          href="/material?tab=pack-units"
        />
        <StatTile
          label="Geräte-Typen"
          value={deviceCount}
          icon={Package}
          href="/material?tab=devices"
        />
        <StatTile
          label="Projekte"
          value={projectCount}
          icon={FolderKanban}
          href="/projects"
        />
      </StatTileGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4" /> Anstehende Projekte
              <InfoHint text="Projekte mit Status Entwurf oder Bestätigt, deren Planungszeitraum in der Zukunft liegt." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingProjects.length === 0 ? (
              <EmptyState bare title="Keine anstehenden Projekte." />
            ) : (
              <ul className="divide-y rounded-lg border">
                {upcomingProjects.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/projects/${p.id}`}
                      className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-secondary"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(p.planningStart)} – {formatDate(p.planningEnd)}
                        </div>
                      </div>
                      <Badge variant={projectStatusVariant(p.status)} size="sm">
                        {projectStatusLabel(p.status)}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" /> Aktive Projekte
              <InfoHint text="Projekte mit Status Aktiv — laufen aktuell." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeProjects.length === 0 ? (
              <EmptyState bare title="Keine aktiven Projekte." />
            ) : (
              <ul className="divide-y rounded-lg border">
                {activeProjects.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/projects/${p.id}`}
                      className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-secondary"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          bis {formatDate(p.planningEnd)}
                        </div>
                      </div>
                      <Badge variant={projectStatusVariant(p.status)} size="sm">
                        {projectStatusLabel(p.status)}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
