"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableEmpty } from "@/components/ui/table-empty";
import { Badge } from "@/components/ui/badge";
import { ListCard } from "@/components/layout/list-card";
import { FilterResetButton, FilterSearch } from "@/components/filters/filter-controls";
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
  const router = useRouter();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) || (r.customerName ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const now = Date.now();

  return (
    <ListCard
      title="Zu fakturieren"
      info={'Abgeschlossene Projekte ohne Rechnung — sortiert nach Planungsende aufsteigend, also „am längsten überfällig" zuerst.'}
      count={{ shown: filtered.length, total: rows.length }}
      filters={
        <>
          <FilterSearch
            value={search}
            onChange={setSearch}
            placeholder="Projekt oder Kunde…"
          />
          {search && <FilterResetButton onClick={() => setSearch("")} />}
        </>
      }
    >
      <Table density="compact">
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
            <TableEmpty
              colSpan={5}
              hasData={rows.length > 0}
              entity="Projekte"
              emptyText="Alles abgerechnet — aktuell stehen keine Projekte zur Fakturierung an."
            />
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
              <TableRow
                key={p.id}
                className="cursor-pointer"
                onClick={() => router.push(`/projects/${p.id}`)}
              >
                <TableCell>
                  <Badge variant={projectStatusVariant(p.status)} size="sm">
                    {projectStatusLabel(p.status)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={projectKindVariant(p.kind)} size="sm">
                    {projectKindLabel(p.kind)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Link
                    href={`/projects/${p.id}`}
                    className="block hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="font-medium">{p.name}</div>
                    {p.customerName && (
                      <div className="text-[11px] text-muted-foreground">{p.customerName}</div>
                    )}
                  </Link>
                </TableCell>
                <TableCell>
                  {formatDate(p.planningStart)} – {formatDate(p.planningEnd)}
                </TableCell>
                <TableCell className="num text-right">
                  <span className={overdueClass}>
                    {daysOverdue} {daysOverdue === 1 ? "Tag" : "Tage"}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </ListCard>
  );
}
