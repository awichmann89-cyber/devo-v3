"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableEmpty } from "@/components/ui/table-empty";
import { RowAction, RowActions } from "@/components/ui/row-actions";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ListCard } from "@/components/layout/list-card";
import {
  FilterChips,
  FilterDivider,
  FilterResetButton,
  FilterSearch,
} from "@/components/filters/filter-controls";
import { CheckCircle2, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {
  quoteStatus,
  quoteStatusLabel,
  quoteStatusVariant,
  type QuoteStatus,
} from "@/lib/labels";
import { toastError } from "@/lib/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteQuoteFromList } from "./actions";

export interface QuoteVM {
  id: string;
  number: string;
  date: string;
  expiresAt: string;
  totalNet: number;
  totalGross: number | null;
  projectId: string;
  projectName: string;
  customerName: string | null;
  /** Wann das Angebot vom Kunden angenommen wurde (ISO). Null = nicht angenommen. */
  acceptedAt: string | null;
  acceptedByName: string | null;
  /** Wenn gesetzt, wurde dieses Angebot durch ein neueres ersetzt. */
  supersededByQuoteId: string | null;
}

function gross(q: QuoteVM): number {
  return q.totalGross ?? q.totalNet;
}

type StatusFilter = "all" | Exclude<QuoteStatus, "superseded">;

export function QuotesTable({ rows: quotes }: { rows: QuoteVM[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<QuoteVM | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    return quotes.filter((q) => {
      // Standardmäßig ersetzte Angebote ausblenden — können per Toggle
      // wieder eingeblendet werden.
      if (!showSuperseded && q.supersededByQuoteId) return false;
      const status = quoteStatus(q);
      if (filter !== "all" && status !== filter) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        q.number.toLowerCase().includes(s) ||
        q.projectName.toLowerCase().includes(s) ||
        (q.customerName ?? "").toLowerCase().includes(s)
      );
    });
  }, [quotes, search, filter, showSuperseded]);

  function handleDelete() {
    if (!deleteDialog) return;
    const id = deleteDialog.id;
    startTransition(async () => {
      try {
        await deleteQuoteFromList(id);
        toast.success("Angebot gelöscht");
        setDeleteDialog(null);
      } catch (e) {
        toastError(e, "Löschen");
      }
    });
  }

  const counts = useMemo(() => {
    const acc = { valid: 0, accepted: 0, expired: 0, superseded: 0 };
    // Für Counts: nur die sichtbaren (nicht-superseded) zählen, sonst stimmt
    // die Filter-Anzeige nicht mehr zur tatsächlichen Tabelle.
    for (const q of quotes) acc[quoteStatus(q)]++;
    return { ...acc, all: quotes.length - acc.superseded };
  }, [quotes]);

  return (
    <>
      <ListCard
        title="Angebote"
        info="Filtere nach Status oder suche nach Nummer, Projekt oder Kunde. Durch neuere Versionen ersetzte Angebote sind standardmäßig ausgeblendet."
        count={{ shown: filtered.length, total: showSuperseded ? quotes.length : counts.all }}
        filters={
          <>
            <FilterSearch
              value={search}
              onChange={setSearch}
              placeholder="Nummer, Projekt oder Kunde…"
            />
            <FilterDivider />
            <FilterChips
              value={filter}
              onChange={(v) => setFilter(v as StatusFilter)}
              items={[
                { value: "all", label: "Alle", count: counts.all },
                {
                  value: "valid",
                  label: quoteStatusLabel("valid"),
                  tone: badgeVariants({ variant: quoteStatusVariant("valid") }),
                  count: counts.valid,
                },
                {
                  value: "accepted",
                  label: quoteStatusLabel("accepted"),
                  tone: badgeVariants({ variant: quoteStatusVariant("accepted") }),
                  count: counts.accepted,
                },
                {
                  value: "expired",
                  label: quoteStatusLabel("expired"),
                  tone: badgeVariants({ variant: quoteStatusVariant("expired") }),
                  count: counts.expired,
                },
              ]}
            />
            {counts.superseded > 0 && (
              <>
                <FilterDivider />
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox
                    checked={showSuperseded}
                    onCheckedChange={(v) => setShowSuperseded(v === true)}
                  />
                  Ersetzte zeigen ({counts.superseded})
                </label>
              </>
            )}
            {(search || filter !== "all") && (
              <FilterResetButton
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                }}
              />
            )}
          </>
        }
      >
        <Table density="compact">
          <TableHeader>
            <TableRow>
              <TableHead>Nummer</TableHead>
              <TableHead>Projekt / Kunde</TableHead>
              <TableHead>Datum</TableHead>
              <TableHead>Gültig bis</TableHead>
              <TableHead className="text-right">Netto</TableHead>
              <TableHead className="text-right">Brutto</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[110px] text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableEmpty
                colSpan={8}
                hasData={quotes.length > 0}
                entity="Angebote"
                emptyText="Noch keine Angebote vorhanden. Angebote entstehen im Finanzen-Tab eines Projekts."
              />
            )}
            {filtered.map((q) => {
              const status = quoteStatus(q);
              return (
                <TableRow key={q.id} className={cn(status === "superseded" && "opacity-60")}>
                  <TableCell className="num">{q.number}</TableCell>
                  <TableCell>
                    <Link href={`/projects/${q.projectId}`} className="block hover:underline">
                      <div className="font-medium">{q.projectName}</div>
                      {q.customerName && (
                        <div className="text-[11px] text-muted-foreground">{q.customerName}</div>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell>{formatDate(q.date)}</TableCell>
                  <TableCell>{formatDate(q.expiresAt)}</TableCell>
                  <TableCell className="num text-right text-muted-foreground">
                    {formatCurrency(q.totalNet)}
                  </TableCell>
                  <TableCell className="num-strong text-right">
                    {formatCurrency(gross(q))}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={quoteStatusVariant(status)}
                      size="sm"
                      title={
                        status === "accepted" && q.acceptedByName
                          ? `Angenommen von ${q.acceptedByName}`
                          : undefined
                      }
                    >
                      {status === "accepted" && <CheckCircle2 className="h-3 w-3" />}
                      {quoteStatusLabel(status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <RowActions density="compact">
                      <RowAction
                        icon={Download}
                        label="PDF herunterladen"
                        download={{
                          href: `/api/projects/${q.projectId}/quotes/${q.id}/pdf?download=1`,
                          fileName: true,
                        }}
                      />
                      <RowAction
                        icon={Trash2}
                        label="Angebot löschen"
                        destructive
                        onClick={() => setDeleteDialog(q)}
                      />
                    </RowActions>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ListCard>

      <ConfirmDialog
        open={deleteDialog !== null}
        onOpenChange={(o) => !o && setDeleteDialog(null)}
        title="Angebot löschen?"
        description={
          deleteDialog && (
            <>
              Angebot <strong>{deleteDialog.number}</strong> über{" "}
              <strong>{formatCurrency(gross(deleteDialog))}</strong> brutto wird
              gelöscht. Die Nummer wird nicht wiederverwendet.
            </>
          )
        }
        confirmLabel="Löschen"
        pending={pending}
        onConfirm={handleDelete}
      />
    </>
  );
}
