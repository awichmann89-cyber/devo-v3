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
import { CheckCircle2, Download, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
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

/**
 * Status-Filter für die Tabelle. "valid" = noch gültig, nicht angenommen,
 * nicht ersetzt. "accepted" = vom Kunden bestätigt. "expired" = abgelaufen.
 * "superseded" = durch eine neuere Version abgelöst.
 */
type StatusFilter = "all" | "valid" | "accepted" | "expired";

type QuoteVisibleStatus = "valid" | "accepted" | "expired";

function quoteStatus(q: QuoteVM): QuoteVisibleStatus {
  if (q.acceptedAt) return "accepted";
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(q.expiresAt);
  exp.setHours(0, 0, 0, 0);
  return exp < now ? "expired" : "valid";
}

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
      if (filter === "valid" && status !== "valid") return false;
      if (filter === "accepted" && status !== "accepted") return false;
      if (filter === "expired" && status !== "expired") return false;
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
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  const counts = useMemo(() => {
    let valid = 0;
    let accepted = 0;
    let expired = 0;
    let supersededCount = 0;
    // Für Counts: nur die sichtbaren (nicht-superseded) zählen, sonst stimmt
    // die Filter-Anzeige nicht mehr zur tatsächlichen Tabelle.
    for (const q of quotes) {
      if (q.supersededByQuoteId) {
        supersededCount++;
        continue;
      }
      const status = quoteStatus(q);
      if (status === "valid") valid++;
      else if (status === "accepted") accepted++;
      else expired++;
    }
    return {
      all: quotes.length - supersededCount,
      valid,
      accepted,
      expired,
      supersededCount,
    };
  }, [quotes]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Angebote</CardTitle>
          <CardDescription>
            Filtere nach Status oder suche nach Nummer, Projekt oder Kunde.
          </CardDescription>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Nummer, Projekt oder Kunde…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-72 pl-8"
              />
            </div>
            <div className="flex items-center gap-1">
              <FilterButton
                active={filter === "all"}
                onClick={() => setFilter("all")}
                count={counts.all}
              >
                Alle
              </FilterButton>
              <FilterButton
                active={filter === "valid"}
                onClick={() => setFilter("valid")}
                count={counts.valid}
              >
                Gültig
              </FilterButton>
              <FilterButton
                active={filter === "accepted"}
                onClick={() => setFilter("accepted")}
                count={counts.accepted}
              >
                Angenommen
              </FilterButton>
              <FilterButton
                active={filter === "expired"}
                onClick={() => setFilter("expired")}
                count={counts.expired}
              >
                Abgelaufen
              </FilterButton>
            </div>
            {counts.supersededCount > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showSuperseded}
                  onChange={(e) => setShowSuperseded(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Ersetzte zeigen ({counts.supersededCount})
              </label>
            )}
            {(search || filter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                }}
              >
                <X className="h-4 w-4" /> Filter zurücksetzen
              </Button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length} von {counts.all}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
          <Table className="[&_td]:px-3 [&_td]:py-1.5">
            <TableHeader>
              <TableRow>
                <TableHead>Nummer</TableHead>
                <TableHead>Projekt / Kunde</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead>Gültig bis</TableHead>
                <TableHead className="text-right">Netto</TableHead>
                <TableHead className="text-right">Brutto</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[120px] text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    Keine Treffer für die Suche.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((q) => {
                const status = quoteStatus(q);
                const isSuperseded = !!q.supersededByQuoteId;
                return (
                  <TableRow
                    key={q.id}
                    className={cn(isSuperseded && "opacity-60")}
                  >
                    <TableCell className="font-mono text-sm">
                      {q.number}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/projects/${q.projectId}`}
                        className="block hover:underline"
                      >
                        <div className="font-medium">{q.projectName}</div>
                        {q.customerName && (
                          <div className="text-[11px] text-muted-foreground">
                            {q.customerName}
                          </div>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(q.date)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(q.expiresAt)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-sm text-muted-foreground">
                      {formatCurrency(q.totalNet)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-sm font-medium">
                      {formatCurrency(gross(q))}
                    </TableCell>
                    <TableCell>
                      {isSuperseded ? (
                        <Badge variant="secondary" className="text-[10px]">
                          Ersetzt
                        </Badge>
                      ) : status === "accepted" ? (
                        <Badge
                          variant="success"
                          className="max-w-none gap-1 text-[10px]"
                          title={
                            q.acceptedByName
                              ? `Angenommen von ${q.acceptedByName}`
                              : "Angenommen"
                          }
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Angenommen
                        </Badge>
                      ) : (
                        <Badge
                          variant={status === "valid" ? "success" : "secondary"}
                          className={cn("text-[10px]")}
                        >
                          {status === "valid" ? "Gültig" : "Abgelaufen"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                        >
                          <a
                            href={`/api/projects/${q.projectId}/quotes/${q.id}/pdf?download=1`}
                            download
                            rel="noopener"
                            title="PDF herunterladen"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteDialog(q)}
                          title="Angebot löschen"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={active ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      className="gap-1"
    >
      {children}
      <span className="text-xs opacity-70">({count})</span>
    </Button>
  );
}
