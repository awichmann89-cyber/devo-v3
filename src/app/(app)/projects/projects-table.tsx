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
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Search, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

/** Getönte Chip-Klassen je Status — analog zu den Badge-Varianten. */
function statusChipClass(s: ProjectStatus): string {
  return {
    DRAFT: "bg-accent text-muted-foreground",
    CONFIRMED: "bg-info-subtle text-info",
    ACTIVE: "bg-primary-subtle text-primary",
    COMPLETED: "bg-success-subtle text-success",
    CANCELLED: "bg-destructive-subtle text-destructive",
  }[s];
}

interface Props {
  projects: ProjectRow[];
  initialFrom: string;
  initialTo: string;
  /** Für die profilbezogene Filter-Persistenz (localStorage-Key). */
  userId?: string | null;
  /** Aktion rechts in der Filterleiste, z.B. „Projekt anlegen". */
  action?: ReactNode;
}

export function ProjectsTable({ projects, initialFrom, initialTo, userId, action }: Props) {
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

  // ----- Filter-Persistenz pro Profil -----
  // Gespeichert wird in localStorage unter einem benutzerspezifischen Key,
  // damit die Filter beim Seitenwechsel (und je Benutzer) erhalten bleiben.
  const storageKey = `devo:projects-filter:${userId ?? "anon"}`;
  const restored = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as {
          from?: string;
          to?: string;
          statuses?: string[];
          search?: string;
        };
        if (Array.isArray(saved.statuses)) {
          const valid = saved.statuses.filter((s): s is ProjectStatus =>
            (STATUS_ORDER as string[]).includes(s),
          );
          if (valid.length > 0) setStatusFilter(new Set(valid));
        }
        if (typeof saved.search === "string") setSearch(saved.search);
        // Zeitraum nur übernehmen, wenn die URL keinen expliziten trägt.
        if (!params.get("from") && !params.get("to") && saved.from && saved.to) {
          setFrom(saved.from);
          setTo(saved.to);
          const p = new URLSearchParams(params.toString());
          p.set("from", saved.from);
          p.set("to", saved.to);
          router.replace(`/projects?${p.toString()}`);
        }
      }
    } catch {
      // localStorage nicht verfügbar oder korrupt — Defaults verwenden
    }
    restored.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ from, to, statuses: Array.from(statusFilter), search }),
      );
    } catch {
      // localStorage nicht verfügbar — Filter gelten nur für die Session
    }
  }, [from, to, statusFilter, search, storageKey]);

  function applyRange(f: string, t: string) {
    const p = new URLSearchParams(params.toString());
    p.set("from", f);
    p.set("to", t);
    router.replace(`/projects?${p.toString()}`);
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
    DEFAULT_STATUSES.every((s) => statusFilter.has(s)) &&
    search === "";

  function resetClientFilters() {
    setStatusFilter(new Set(DEFAULT_STATUSES));
    setSearch("");
  }

  return (
    <div className="space-y-3">
      {/* Kompakte Filterleiste (Redesign): Suche, Zeitraum, Status-Chips —
          wirkt sofort, kein »Anwenden«. Zustand wird pro Profil gespeichert. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input
            placeholder="Name oder Kunde…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-[34px] w-[210px] pl-8"
          />
        </div>
        <Input
          type="date"
          aria-label="Von"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            if (e.target.value && to) applyRange(e.target.value, to);
          }}
          className="h-[34px] w-[144px]"
        />
        <span className="text-xs text-faint">bis</span>
        <Input
          type="date"
          aria-label="Bis"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            if (from && e.target.value) applyRange(from, e.target.value);
          }}
          className="h-[34px] w-[144px]"
        />
        <Select value="" onValueChange={(v) => setPreset(Number(v))}>
          <SelectTrigger className="h-[34px] w-[130px] text-xs text-muted-foreground">
            <SelectValue placeholder="Zeitraum…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Aktueller Monat</SelectItem>
            <SelectItem value="3">3 Monate</SelectItem>
            <SelectItem value="6">6 Monate</SelectItem>
            <SelectItem value="12">12 Monate</SelectItem>
          </SelectContent>
        </Select>

        <div className="mx-1 hidden h-[26px] w-px bg-border sm:block" aria-hidden />

        {STATUS_ORDER.map((s) => {
          const active = statusFilter.has(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              title={active ? "Status ausblenden" : "Status einblenden"}
              className={cn(
                "inline-flex h-[26px] items-center gap-1 rounded-[5px] px-2.5 text-xs font-semibold transition-colors",
                active
                  ? statusChipClass(s)
                  : "border border-dashed border-input font-medium text-muted-foreground hover:border-primary hover:text-primary",
              )}
            >
              {active && <Check className="h-3 w-3" />}
              {projectStatusLabel(s)}
            </button>
          );
        })}
        {!filtersAtDefault && (
          <button
            type="button"
            onClick={resetClientFilters}
            title="Filter zurücksetzen"
            className="inline-flex h-[26px] items-center gap-1 rounded-[5px] px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive-subtle hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" /> Zurücksetzen
          </button>
        )}

        {action && <div className="ml-auto">{action}</div>}
      </div>

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
