"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import {
  projectKindLabel,
  projectKindVariant,
  projectStatusLabel,
  projectStatusVariant,
} from "@/lib/labels";
import type { ProjectKind, ProjectStatus } from "@prisma/client";

interface ProjectRow {
  id: string;
  name: string;
  status: ProjectStatus;
  kind: ProjectKind;
  planningStart: Date;
  planningEnd: Date;
  customer: { name: string } | null;
  billingPeriods: Array<{ start: Date; end: Date }>;
  _count: { assignments: number };
}

interface Props {
  projects: ProjectRow[];
}

export function ProjectsTable({ projects }: Props) {
  const [search, setSearch] = useState("");

  const filtered = projects.filter((p) => {
    if (!search) return true;
    return p.name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Projektname suchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        {search && (
          <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
            <X className="h-4 w-4" /> Filter zurücksetzen
          </Button>
        )}
      </div>

      <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:h-10 [&_th]:px-3">
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Kategorie</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Kunde</TableHead>
            <TableHead>Planungszeitraum</TableHead>
            <TableHead>Berechnungszeitraum</TableHead>
            <TableHead className="text-right">Geräte</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                {projects.length === 0
                  ? "Keine Projekte angelegt"
                  : "Keine Treffer für die Suche"}
              </TableCell>
            </TableRow>
          )}
          {filtered.map((p) => (
            <TableRow key={p.id}>
              <TableCell>
                <Badge variant={projectStatusVariant(p.status)}>
                  {projectStatusLabel(p.status)}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={projectKindVariant(p.kind)} className="text-[10px]">
                  {projectKindLabel(p.kind)}
                </Badge>
              </TableCell>
              <TableCell>
                <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                  {p.name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {p.customer?.name ?? "—"}
              </TableCell>
              <TableCell className="text-sm">
                {formatDate(p.planningStart)} – {formatDate(p.planningEnd)}
              </TableCell>
              <TableCell className="text-sm">
                {p.billingPeriods.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : p.billingPeriods.length === 1 ? (
                  <>
                    {formatDate(p.billingPeriods[0].start)} –{" "}
                    {formatDate(p.billingPeriods[0].end)}
                  </>
                ) : (
                  <>
                    {formatDate(p.billingPeriods[0].start)} –{" "}
                    {formatDate(p.billingPeriods[p.billingPeriods.length - 1].end)}
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({p.billingPeriods.length} Zeiträume)
                    </span>
                  </>
                )}
              </TableCell>
              <TableCell className="text-right">{p._count.assignments}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
