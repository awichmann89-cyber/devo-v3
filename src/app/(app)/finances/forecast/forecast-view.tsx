"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, X } from "lucide-react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { projectStatusLabel, projectStatusVariant } from "@/lib/labels";
import { ProjectStatus } from "@prisma/client";

export interface ForecastRowVM {
  id: string;
  name: string;
  status: ProjectStatus;
  customerName: string | null;
  billingStart: string;
  billingEnd: string;
  total: number;
  invoiced: number;
  outstanding: number;
  hasInvoice: boolean;
  /** Interne Zusatzkosten (Zumietung + Extrakosten). */
  costs: number;
  /** Erwarteter Gewinn = Projektwert − Zusatzkosten. */
  profit: number;
}

type InvoiceFilter = "all" | "without" | "with";

const STATUS_ORDER: ProjectStatus[] = [
  "DRAFT",
  "CONFIRMED",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
];

const DEFAULT_STATUSES: ProjectStatus[] = ["DRAFT", "CONFIRMED", "ACTIVE", "COMPLETED"];

interface Props {
  rows: ForecastRowVM[];
  initialFrom: string; // YYYY-MM-DD
  initialTo: string;
}

export function ForecastView({ rows, initialFrom, initialTo }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  // Zeitraum: lokaler State, server-side über URL
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  // Status / Rechnung: rein clientseitig
  const [statusFilter, setStatusFilter] = useState<Set<ProjectStatus>>(
    new Set(DEFAULT_STATUSES)
  );
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>("all");

  function applyRange(f: string, t: string) {
    const p = new URLSearchParams(params.toString());
    p.set("from", f);
    p.set("to", t);
    router.push(`/finances/forecast?${p.toString()}`);
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
    return rows.filter((r) => {
      if (!statusFilter.has(r.status)) return false;
      if (invoiceFilter === "without" && r.hasInvoice) return false;
      if (invoiceFilter === "with" && !r.hasInvoice) return false;
      return true;
    });
  }, [rows, statusFilter, invoiceFilter]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => ({
        total: acc.total + r.total,
        invoiced: acc.invoiced + r.invoiced,
        outstanding: acc.outstanding + r.outstanding,
        costs: acc.costs + r.costs,
        profit: acc.profit + r.profit,
      }),
      { total: 0, invoiced: 0, outstanding: 0, costs: 0, profit: 0 }
    );
  }, [filtered]);

  const filtersAtDefault =
    statusFilter.size === DEFAULT_STATUSES.length &&
    DEFAULT_STATUSES.every((s) => statusFilter.has(s)) &&
    invoiceFilter === "all";

  function resetClientFilters() {
    setStatusFilter(new Set(DEFAULT_STATUSES));
    setInvoiceFilter("all");
  }

  return (
    <div className="space-y-6">
      {/* Filter-Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Zeitraum-Filter */}
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

          {/* Status-Filter */}
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
                      : "border-input text-muted-foreground hover:bg-accent"
                  )}
                >
                  {active && <Check className="h-3 w-3" />}
                  {projectStatusLabel(s)}
                </button>
              );
            })}
          </div>

          {/* Rechnungs-Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0 w-[60px]">
              Rechnung:
            </span>
            <FilterChip
              label="Alle"
              active={invoiceFilter === "all"}
              onClick={() => setInvoiceFilter("all")}
            />
            <FilterChip
              label="Nur ohne Rechnung"
              active={invoiceFilter === "without"}
              onClick={() => setInvoiceFilter("without")}
            />
            <FilterChip
              label="Nur mit Rechnung"
              active={invoiceFilter === "with"}
              onClick={() => setInvoiceFilter("with")}
            />
            {!filtersAtDefault && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={resetClientFilters}
              >
                <X className="h-4 w-4" /> Status/Rechnung zurücksetzen
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Kennzahlen */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Projektvolumen (Netto)"
          amount={totals.total}
          variant="default"
        />
        <StatCard
          label="Zusatzkosten (Netto)"
          amount={totals.costs}
          variant="muted"
        />
        <StatCard
          label="Erwarteter Gewinn (Netto)"
          amount={totals.profit}
          variant="profit"
        />
        <StatCard
          label="Noch offen (Netto)"
          amount={totals.outstanding}
          variant="success"
        />
      </div>

      {/* Projekt-Tabelle */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Projekte im Zeitraum {formatDate(new Date(initialFrom))} –{" "}
            {formatDate(new Date(initialTo))}
          </CardTitle>
          <CardDescription>
            Sortiert nach Berechnungs-Start.{" "}
            <strong>Alle Beträge sind Nettowerte</strong> (vor MwSt.).{" "}
            <span className="text-xs">
              ({filtered.length} von {rows.length})
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Keine Projekte mit diesen Filtern.
            </p>
          ) : (
            <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:h-10 [&_th]:px-3">
              <TableHeader>
                <TableRow>
                  <TableHead>Projekt / Kunde</TableHead>
                  <TableHead>Berechnungs-Zeitraum</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Projektwert (Netto)</TableHead>
                  <TableHead className="text-right">Zusatzkosten</TableHead>
                  <TableHead className="text-right">Gewinn (Netto)</TableHead>
                  <TableHead className="text-right">In Rechnung (Netto)</TableHead>
                  <TableHead className="text-right">Offen (Netto)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        href={`/projects/${r.id}`}
                        className="block hover:underline"
                      >
                        <div className="font-medium">{r.name}</div>
                        {r.customerName && (
                          <div className="text-[11px] text-muted-foreground">
                            {r.customerName}
                          </div>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(r.billingStart)} – {formatDate(r.billingEnd)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={projectStatusVariant(r.status)}
                        className="text-[10px]"
                      >
                        {projectStatusLabel(r.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-sm">
                      {formatCurrency(r.total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-sm text-muted-foreground">
                      {r.costs > 0 ? "−" + formatCurrency(r.costs) : "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums font-mono text-sm font-medium",
                        r.profit < 0
                          ? "text-destructive"
                          : "text-emerald-700 dark:text-emerald-400"
                      )}
                    >
                      {formatCurrency(r.profit)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-sm text-muted-foreground">
                      {r.invoiced > 0 ? formatCurrency(r.invoiced) : "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums font-mono text-sm font-medium",
                        r.outstanding > 0 && "text-emerald-600",
                        r.outstanding < 0 && "text-destructive"
                      )}
                    >
                      {formatCurrency(r.outstanding)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 bg-muted/40">
                  <TableCell className="font-bold" colSpan={3}>
                    Summe
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono font-bold">
                    {formatCurrency(totals.total)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono font-bold text-muted-foreground">
                    {totals.costs > 0 ? "−" + formatCurrency(totals.costs) : "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums font-mono font-bold",
                      totals.profit < 0
                        ? "text-destructive"
                        : "text-emerald-700 dark:text-emerald-400"
                    )}
                  >
                    {formatCurrency(totals.profit)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono font-bold">
                    {formatCurrency(totals.invoiced)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono font-bold">
                    {formatCurrency(totals.outstanding)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  amount,
  variant,
}: {
  label: string;
  amount: number;
  variant: "default" | "muted" | "success" | "profit";
}) {
  // Beim Gewinn signalisiert die Farbe des Betrags Profit (grün) vs. Verlust (rot).
  const profitNegative = variant === "profit" && amount < 0;
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4",
        variant === "profit" && "border-emerald-600/40",
        profitNegative && "border-destructive/50"
      )}
    >
      <div
        className={cn(
          "text-xs uppercase tracking-wide",
          variant === "muted" && "text-muted-foreground",
          variant === "success" && "text-emerald-600",
          variant === "default" && "text-foreground",
          variant === "profit" &&
            (profitNegative ? "text-destructive" : "text-emerald-600")
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-xl font-bold tabular-nums font-mono",
          variant === "profit" &&
            (profitNegative ? "text-destructive" : "text-emerald-700 dark:text-emerald-400")
        )}
      >
        {formatCurrency(amount)}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
        active
          ? "bg-foreground border-foreground text-background"
          : "border-input text-muted-foreground hover:bg-accent"
      )}
    >
      {label}
    </button>
  );
}
