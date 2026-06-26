"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, X } from "lucide-react";
import Link from "next/link";
import { formatDate, cn } from "@/lib/utils";
import {
  projectKindLabel,
  projectKindVariant,
  projectStatusLabel,
  projectStatusRowClass,
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
  maintainer: { name: string | null; email: string } | null;
  billingPeriods: Array<{ start: Date; end: Date }>;
  _count: { assignments: number };
}

const STATUS_ORDER: ProjectStatus[] = [
  "DRAFT",
  "CONFIRMED",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
];

// Default sichtbar: ohne CANCELLED — abgesagte Projekte sind selten relevant
// für die normale Übersicht, können aber per Toggle eingeblendet werden.
const DEFAULT_STATUSES: ProjectStatus[] = [
  "DRAFT",
  "CONFIRMED",
  "ACTIVE",
  "COMPLETED",
];

interface Props {
  projects: ProjectRow[];
  initialFrom: string;
  initialTo: string;
}

export function ProjectsTable({ projects, initialFrom, initialTo }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState("");

  // Zeitraum: lokaler State + URL-Sync (analog Forecast).
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  // Status-Multiselect: clientseitig.
  const [statusFilter, setStatusFilter] = useState<Set<ProjectStatus>>(
    new Set(DEFAULT_STATUSES),
  );

  function applyRange(f: string, t: string) {
    const p = new URLSearchParams(params.toString());
    p.set("from", f);
    p.set("to", t);
    router.push(`/projects?${p.toString()}`);
  }

  function setPreset(months: number) {
    const now = new Date();
    const f = new Date(now.getFullYear(), now.getMonth(), 1);
    const t = new Date(now.getFullYear(), now.getMonth() + months, 0);
    const fs = f.toISOString().slice(0, 10);
    const ts = t.toISOString().slice(0, 10);
    setFrom(fs);
    setTo(ts);
    applyRange(fs, ts);
  }

  function toggleStatus(s: ProjectStatus) {
    const next = new Set(statusFilter);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    setStatusFilter(next);
  }

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (!statusFilter.has(p.status)) return false;
      if (search) {
        const q = search.toLowerCase();
        const matches =
          p.name.toLowerCase().includes(q) ||
          (p.customer?.name ?? "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [projects, search, statusFilter]);

  const filtersAtDefault =
    statusFilter.size === DEFAULT_STATUSES.length &&
    DEFAULT_STATUSES.every((s) => statusFilter.has(s));

  function resetClientFilters() {
    setStatusFilter(new Set(DEFAULT_STATUSES));
    setSearch("");
  }

  return (
    <div className="space-y-4">
      {/* Filter-Card — Zeitraum + Status-Multiselect + Suche. Analog zur
          Forecast-Seite, aber ohne Rechnungs-Filter (auf der Projekte-Seite
          nicht relevant). */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Zeitraum */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="from" className="text-xs">Von</Label>
              <Input
                id="from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to" className="text-xs">Bis</Label>
              <Input
                id="to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <Button onClick={() => applyRange(from, to)} size="sm">
              Anwenden
            </Button>
            <div className="ml-auto flex flex-wrap gap-1">
              <Button variant="ghost" size="sm" onClick={() => setPreset(1)}>
                Aktueller Monat
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPreset(3)}>
                3 Monate
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPreset(6)}>
                6 Monate
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPreset(12)}>
                12 Monate
              </Button>
            </div>
          </div>

          {/* Status */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0 w-[60px]">
              Status:
            </span>
            {STATUS_ORDER.map((s) => {
              const active = statusFilter.has(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
                    active
                      ? "bg-secondary border-secondary text-secondary-foreground"
                      : "border-input text-muted-foreground hover:bg-accent",
                  )}
                >
                  {active && <Check className="h-3 w-3" />}
                  {projectStatusLabel(s)}
                </button>
              );
            })}
            {!filtersAtDefault && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={resetClientFilters}
              >
                <X className="h-4 w-4" /> Zurücksetzen
              </Button>
            )}
          </div>

          {/* Suche */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0 w-[60px]">
              Suche:
            </span>
            <Input
              placeholder="Name oder Kunde…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabelle */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {filtered.length} von {projects.length} Projekten
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:h-10 [&_th]:px-3">
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Kategorie</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Kunde</TableHead>
                <TableHead>Verantwortlich</TableHead>
                <TableHead>Planungszeitraum</TableHead>
                <TableHead>Berechnungszeitraum</TableHead>
                <TableHead className="text-right">Geräte</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    {projects.length === 0
                      ? "Keine Projekte im gewählten Zeitraum"
                      : "Keine Treffer für diese Filter"}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((p) => (
                <TableRow
                  key={p.id}
                  className={cn("cursor-pointer", projectStatusRowClass(p.status))}
                  onClick={() => router.push(`/projects/${p.id}`)}
                >
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
                  <TableCell className="text-sm text-muted-foreground">
                    {p.maintainer ? (p.maintainer.name || p.maintainer.email) : "—"}
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
                  <TableCell className="text-right tabular-nums">
                    {p._count.assignments}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
