"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FILTER_STATUS_ORDER as STATUS_ORDER,
  FILTER_DEFAULT_STATUSES as DEFAULT_STATUSES,
  DateRangeControls,
  StatusChips,
  FilterResetButton,
  FilterDivider,
} from "@/components/filters/filter-controls";
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

interface Props {
  rows: ForecastRowVM[];
  initialFrom: string; // YYYY-MM-DD
  initialTo: string;
  /** Für die profilbezogene Filter-Persistenz (localStorage-Key). */
  userId?: string | null;
}

export function ForecastView({ rows, initialFrom, initialTo, userId }: Props) {
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

  // ----- Filter-Persistenz pro Profil (analog Projekte-Seite) -----
  const storageKey = `devo:forecast-filter:${userId ?? "anon"}`;
  const restored = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as {
          from?: string;
          to?: string;
          statuses?: string[];
          invoiceFilter?: InvoiceFilter;
        };
        if (Array.isArray(saved.statuses)) {
          const valid = saved.statuses.filter((s): s is ProjectStatus =>
            (STATUS_ORDER as string[]).includes(s),
          );
          if (valid.length > 0) setStatusFilter(new Set(valid));
        }
        if (saved.invoiceFilter === "all" || saved.invoiceFilter === "without" || saved.invoiceFilter === "with") {
          setInvoiceFilter(saved.invoiceFilter);
        }
        if (!params.get("from") && !params.get("to") && saved.from && saved.to) {
          setFrom(saved.from);
          setTo(saved.to);
          const p = new URLSearchParams(params.toString());
          p.set("from", saved.from);
          p.set("to", saved.to);
          router.replace(`/finances/forecast?${p.toString()}`);
        }
      }
    } catch {
      // localStorage nicht verfügbar — Defaults verwenden
    }
    restored.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ from, to, statuses: Array.from(statusFilter), invoiceFilter }),
      );
    } catch {
      // localStorage nicht verfügbar — Filter gelten nur für die Session
    }
  }, [from, to, statusFilter, invoiceFilter, storageKey]);

  function applyRange(f: string, t: string) {
    const p = new URLSearchParams(params.toString());
    p.set("from", f);
    p.set("to", t);
    router.replace(`/finances/forecast?${p.toString()}`);
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
    <div className="space-y-3">
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

      {/* Forecast-Card: Überschrift → Filterleiste → Tabelle */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Forecast</CardTitle>
          <span className="text-[11px] text-muted-foreground">
            Sortiert nach Berechnungs-Start · alle Beträge Netto
          </span>
        </CardHeader>

        {/* Kompakte Filterleiste in der Card — wirkt sofort, wird pro Profil gespeichert. */}
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
          <DateRangeControls
            from={from}
            to={to}
            onRangeChange={(f, t) => {
              setFrom(f);
              setTo(t);
              if (f && t) applyRange(f, t);
            }}
            onPreset={setPreset}
          />
          <Select
            value={invoiceFilter}
            onValueChange={(v) => setInvoiceFilter(v as InvoiceFilter)}
          >
            <SelectTrigger className="h-[34px] w-[170px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Rechnungen</SelectItem>
              <SelectItem value="without">Nur ohne Rechnung</SelectItem>
              <SelectItem value="with">Nur mit Rechnung</SelectItem>
            </SelectContent>
          </Select>
          <FilterDivider />
          <StatusChips selected={statusFilter} onToggle={toggleStatus} />
          {!filtersAtDefault && <FilterResetButton onClick={resetClientFilters} />}
        </div>

        <CardContent className="px-4 pb-4">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Keine Projekte mit diesen Filtern.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
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
                          : "text-success"
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
                        r.outstanding > 0 && "text-success",
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
                        : "text-success"
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
            </div>
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
        variant === "profit" && "border-success/40",
        profitNegative && "border-destructive/50"
      )}
    >
      <div
        className={cn(
          "text-xs uppercase tracking-wide",
          variant === "muted" && "text-muted-foreground",
          variant === "success" && "text-success",
          variant === "default" && "text-foreground",
          variant === "profit" &&
            (profitNegative ? "text-destructive" : "text-success")
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-xl font-bold tabular-nums font-mono",
          variant === "profit" &&
            (profitNegative ? "text-destructive" : "text-success")
        )}
      >
        {formatCurrency(amount)}
      </div>
    </div>
  );
}

