import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";
import { projectStatusLabel, projectStatusVariant } from "@/lib/labels";

export default async function ProjectsPage() {
  const projects = await prisma.project.findMany({
    include: {
      _count: { select: { assignments: true } },
      createdBy: { select: { name: true, email: true } },
    },
    orderBy: { planningStart: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projekte</h1>
          <p className="text-muted-foreground">Veranstaltungen und Vermietungen</p>
        </div>
        <Button asChild>
          <Link href="/projects/new"><Plus className="h-4 w-4" /> Neues Projekt</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{projects.length} Projekte</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Kunde</TableHead>
                <TableHead>Planungszeitraum</TableHead>
                <TableHead>Berechnungszeitraum</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Geräte</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Keine Projekte angelegt
                  </TableCell>
                </TableRow>
              )}
              {projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.customer ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {formatDate(p.planningStart)} – {formatDate(p.planningEnd)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDate(p.billingStart)} – {formatDate(p.billingEnd)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={projectStatusVariant(p.status)}>{projectStatusLabel(p.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{p._count.assignments}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
