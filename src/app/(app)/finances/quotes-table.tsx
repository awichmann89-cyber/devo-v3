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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ExternalLink, Search, Trash2, X } from "lucide-react";
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
}

function gross(q: QuoteVM): number {
  return q.totalGross ?? q.totalNet;
}

type StatusFilter = "all" | "valid" | "expired";

function quoteStatus(q: QuoteVM): "valid" | "expired" {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(q.expiresAt);
  exp.setHours(0, 0, 0, 0);
  return exp < now ? "expired" : "valid";
}

export function QuotesTable({ rows: quotes }: { rows: QuoteVM[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [deleteDialog, setDeleteDialog] = useState<QuoteVM | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    return quotes.filter((q) => {
      const status = quoteStatus(q);
      if (filter === "valid" && status !== "valid") return false;
      if (filter === "expired" && status !== "expired") return false;
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        q.number.toLowerCase().includes(s) ||
        q.projectName.toLowerCase().includes(s) ||
        (q.customerName ?? "").toLowerCase().includes(s)
      );
    });
  }, [quotes, search, filter]);

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
    let expired = 0;
    for (const q of quotes) {
      if (quoteStatus(q) === "valid") valid++;
      else expired++;
    }
    return { all: quotes.length, valid, expired };
  }, [quotes]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filter</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Nummer, Projekt, Kunde…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 pl-8"
            />
          </div>
          <div className="flex items-center gap-1">
            <FilterButton active={filter === "all"} onClick={() => setFilter("all")} count={counts.all}>
              Alle
            </FilterButton>
            <FilterButton active={filter === "valid"} onClick={() => setFilter("valid")} count={counts.valid}>
              Gültig
            </FilterButton>
            <FilterButton active={filter === "expired"} onClick={() => setFilter("expired")} count={counts.expired}>
              Abgelaufen
            </FilterButton>
          </div>
          {(search || filter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setFilter("all");
              }}
            >
              <X className="h-4 w-4" /> Zurücksetzen
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nummer</TableHead>
                <TableHead>Projekt</TableHead>
                <TableHead>Kunde</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead>Gültig bis</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Netto</TableHead>
                <TableHead className="text-right">Brutto</TableHead>
                <TableHead className="w-[120px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                    Keine Angebote für diesen Filter.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((q) => {
                  const status = quoteStatus(q);
                  return (
                    <TableRow key={q.id}>
                      <TableCell className="font-mono">{q.number}</TableCell>
                      <TableCell>
                        <Link href={`/projects/${q.projectId}`} className="hover:underline">
                          {q.projectName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {q.customerName ?? "—"}
                      </TableCell>
                      <TableCell>{formatDate(q.date)}</TableCell>
                      <TableCell>{formatDate(q.expiresAt)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={status === "valid" ? "success" : "secondary"}
                          className={cn("text-[10px]")}
                        >
                          {status === "valid" ? "Gültig" : "Abgelaufen"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-mono text-sm text-muted-foreground">
                        {formatCurrency(q.totalNet)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-mono text-sm font-medium">
                        {formatCurrency(gross(q))}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                            <a
                              href={`/api/projects/${q.projectId}/quotes/${q.id}/pdf`}
                              target="_blank"
                              rel="noopener"
                              title="PDF öffnen"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteDialog(q)}
                            title="Angebot löschen"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
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
