"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Search, X } from "lucide-react";
import { formatDate } from "@/lib/utils";
import {
  projectKindLabel,
  projectKindVariant,
  projectStatusLabel,
  projectStatusVariant,
} from "@/lib/labels";
import type { ProjectKind, ProjectStatus } from "@prisma/client";

export interface PendingRow {
  id: string;
  name: string;
  status: ProjectStatus;
  kind: ProjectKind;
  planningStart: string;
  planningEnd: string;
  customerName: string | null;
}

export function PendingTable({ rows }: { rows: PendingRow[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.customerName ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const now = Date.now();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Zu fakturieren</CardTitle>
        <CardDescription>
          Abgeschlossene Projekte ohne Rechnung — sortiert nach Planungsende
          aufsteigend, also „am längsten überfällig" zuerst.
        </CardDescription>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Projekt oder Kunde…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-72 pl-8"
            />
          </div>
          {search && (
            <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
              <X className="h-4 w-4" /> Filter zurücksetzen
            </Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {filtered.length} von {rows.length}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-lg border">
        <Table className="[&_td]:px-3 [&_td]:py-1.5">
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Kategorie</TableHead>
              <TableHead>Projekt / Kunde</TableHead>
              <TableHead>Planungszeitraum</TableHead>
              <TableHead className="text-right">Tage überfällig</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  Keine Treffer für die Suche.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((p) => {
              const planningEndMs = new Date(p.planningEnd).getTime();
              const daysOverdue = Math.max(
                0,
                Math.floor((now - planningEndMs) / (1000 * 60 * 60 * 24))
              );
              const overdueClass =
                daysOverdue > 30
                  ? "text-destructive font-medium"
                  : daysOverdue > 7
                  ? "text-warning font-medium"
                  : "";
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <Badge variant={projectStatusVariant(p.status)}>
                      {projectStatusLabel(p.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={projectKindVariant(p.kind)}
                      className="text-[10px]"
                    >
                      {projectKindLabel(p.kind)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/projects/${p.id}`}
                      className="block hover:underline"
                    >
                      <div className="font-medium">{p.name}</div>
                      {p.customerName && (
                        <div className="text-[11px] text-muted-foreground">
                          {p.customerName}
                        </div>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDate(p.planningStart)} – {formatDate(p.planningEnd)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={overdueClass}>
                      {daysOverdue} {daysOverdue === 1 ? "Tag" : "Tage"}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      </CardContent>
    </Card>
  );
}
