"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableEmpty } from "@/components/ui/table-empty";
import { Badge } from "@/components/ui/badge";
import { StatTile, StatTileGrid } from "@/components/ui/stat-tile";
import { ListCard } from "@/components/layout/list-card";
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
import { cn, formatCurrency, formatCurrencySigned, formatDate } from "@/lib/utils";
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
    <div className="space-y-4">
      {/* Kennzahlen */}
      <StatTileGrid>
        <StatTile label="Projektvolumen (Netto)" value={formatCurrency(totals.total)} />
        <StatTile
          label="Zusatzkosten (Netto)"
          value={formatCurrencySigned(totals.costs, { negate: true })}
          tone="muted"
        />
        <StatTile
          label="Erwarteter Gewinn (Netto)"
          value={formatCurrency(totals.profit)}
          tone={totals.profit < 0 ? "destructive" : "success"}
        />
        <StatTile
          label="Noch offen (Netto)"
          value={formatCurrency(totals.outstanding)}
          tone="success"
        />
      </StatTileGrid>

      <ListCard
        title="Forecast"
        info={
          <>
            Erwarteter Umsatz und Gewinn aus geplanten Projekten im gewählten
            Zeitraum. Der Gewinn zieht interne Zusatzkosten (Zumietung +
            Extrakosten + Personal aus dem Einsatzplan) vom Projektwert ab — diese
            erscheinen nie auf Angeboten/Rechnungen. Sortiert nach
            Berechnungs-Start. <strong>Alle Beträge sind Nettowerte</strong> (vor MwSt.).
          </>
        }
        count={{ shown: filtered.length, total: rows.length }}
        filters={
          <>
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
              <SelectTrigger className="w-[170px] text-xs" aria-label="Rechnungs-Filter">
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
          </>
        }
      >
        <Table density="compact">
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
            {filtered.length === 0 && (
              <TableEmpty colSpan={8} hasData={rows.length > 0} entity="Projekte" />
            )}
            {filtered.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer"
                onClick={() => router.push(`/projects/${r.id}`)}
              >
                <TableCell>
                  <Link
                    href={`/projects/${r.id}`}
                    className="block hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="font-medium">{r.name}</div>
                    {r.customerName && (
                      <div className="text-[11px] text-muted-foreground">
                        {r.customerName}
                      </div>
                    )}
                  </Link>
                </TableCell>
                <TableCell>
                  {formatDate(r.billingStart)} – {formatDate(r.billingEnd)}
                </TableCell>
                <TableCell>
                  <Badge variant={projectStatusVariant(r.status)} size="sm">
                    {projectStatusLabel(r.status)}
                  </Badge>
                </TableCell>
                <TableCell className="num text-right">{formatCurrency(r.total)}</TableCell>
                <TableCell className="num text-right text-muted-foreground">
                  {formatCurrencySigned(r.costs, { negate: true })}
                </TableCell>
                <TableCell
                  className={cn(
                    "num-strong text-right",
                    r.profit < 0 ? "text-destructive" : "text-success"
                  )}
                >
                  {formatCurrency(r.profit)}
                </TableCell>
                <TableCell className="num text-right text-muted-foreground">
                  {r.invoiced > 0 ? formatCurrency(r.invoiced) : "—"}
                </TableCell>
                <TableCell
                  className={cn(
                    "num-strong text-right",
                    r.outstanding > 0 && "text-success",
                    r.outstanding < 0 && "text-destructive"
                  )}
                >
                  {formatCurrency(r.outstanding)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {filtered.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell className="font-bold" colSpan={3}>
                  Summe
                </TableCell>
                <TableCell className="num text-right font-bold">
                  {formatCurrency(totals.total)}
                </TableCell>
                <TableCell className="num text-right font-bold text-muted-foreground">
                  {formatCurrencySigned(totals.costs, { negate: true })}
                </TableCell>
                <TableCell
                  className={cn(
                    "num text-right font-bold",
                    totals.profit < 0 ? "text-destructive" : "text-success"
                  )}
                >
                  {formatCurrency(totals.profit)}
                </TableCell>
                <TableCell className="num text-right font-bold">
                  {formatCurrency(totals.invoiced)}
                </TableCell>
                <TableCell className="num text-right font-bold">
                  {formatCurrency(totals.outstanding)}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </ListCard>
    </div>
  );
}

