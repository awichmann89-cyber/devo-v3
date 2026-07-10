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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, Download, Loader2, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { setInvoicePaid, deleteInvoiceFromList, createReminderForInvoice, setInvoicePrepayment } from "./actions";

export interface InvoiceVM {
  id: string;
  number: string;
  kind: "INVOICE" | "REMINDER";
  reminderLevel: number;
  relatedInvoiceId: string | null;
  isPrepayment: boolean;
  date: string;
  dueDate: string;
  totalNet: number;
  totalGross: number | null;
  paidAt: string | null;
  projectId: string;
  projectName: string;
  customerName: string | null;
}

function gross(inv: InvoiceVM): number {
  return inv.totalGross ?? inv.totalNet;
}

function labelFor(inv: InvoiceVM): string {
  if (inv.kind === "REMINDER") {
    return inv.reminderLevel > 1
      ? `${inv.reminderLevel}. Mahnung`
      : "Mahnung";
  }
  return inv.isPrepayment ? "Vorkasse" : "Rechnung";
}

type StatusFilter = "all" | "open" | "overdue" | "paid";

function invoiceStatus(inv: InvoiceVM): "paid" | "overdue" | "open" {
  if (inv.paidAt) return "paid";
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(inv.dueDate);
  due.setHours(0, 0, 0, 0);
  if (due < now) return "overdue";
  return "open";
}

export function InvoicesTable({ rows: invoices }: { rows: InvoiceVM[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [payDialog, setPayDialog] = useState<InvoiceVM | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<InvoiceVM | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      const status = invoiceStatus(inv);
      if (filter === "paid" && status !== "paid") return false;
      if (filter === "overdue" && status !== "overdue") return false;
      if (filter === "open" && status !== "open") return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        inv.number.toLowerCase().includes(q) ||
        inv.projectName.toLowerCase().includes(q) ||
        (inv.customerName ?? "").toLowerCase().includes(q)
      );
    });
  }, [invoices, search, filter]);

  const totals = useMemo(() => {
    let open = 0, overdue = 0, paid = 0;
    for (const inv of invoices) {
      const s = invoiceStatus(inv);
      const amount = gross(inv);
      if (s === "open") open += amount;
      else if (s === "overdue") overdue += amount;
      else paid += amount;
    }
    return { open, overdue, paid };
  }, [invoices]);

  function handleMarkUnpaid(inv: InvoiceVM) {
    startTransition(async () => {
      try {
        await setInvoicePaid(inv.id, null);
        toast.success(`${labelFor(inv)} ${inv.number} wieder als unbezahlt markiert`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleTogglePrepayment(inv: InvoiceVM) {
    startTransition(async () => {
      try {
        await setInvoicePrepayment(inv.id, !inv.isPrepayment);
        toast.success(
          !inv.isPrepayment
            ? `${inv.number} auf Vorkasse umgestellt`
            : `${inv.number} auf Rechnung umgestellt`
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleCreateReminder(inv: InvoiceVM) {
    startTransition(async () => {
      try {
        const created = await createReminderForInvoice(inv.id);
        toast.success(`Mahnung ${created.number} angelegt`);
        // Direkt herunterladen — Browser-Vorschau gibt's beim Wieder-Ansehen
        // über den Download-Button in der Tabelle.
        const a = document.createElement("a");
        a.href = `/api/projects/${inv.projectId}/invoices/${created.id}/pdf?download=1`;
        a.download = "";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleDelete() {
    if (!deleteDialog) return;
    const id = deleteDialog.id;
    const number = deleteDialog.number;
    startTransition(async () => {
      try {
        await deleteInvoiceFromList(id);
        toast.success(`Rechnung ${number} gelöscht`);
        setDeleteDialog(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard
          label="Offen (Brutto)"
          amount={totals.open}
          variant="default"
          active={filter === "open"}
          onClick={() => setFilter(filter === "open" ? "all" : "open")}
        />
        <StatCard
          label="Überfällig (Brutto)"
          amount={totals.overdue}
          variant="destructive"
          active={filter === "overdue"}
          onClick={() => setFilter(filter === "overdue" ? "all" : "overdue")}
        />
        <StatCard
          label="Bezahlt (Brutto)"
          amount={totals.paid}
          variant="success"
          active={filter === "paid"}
          onClick={() => setFilter(filter === "paid" ? "all" : "paid")}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rechnungen</CardTitle>
          <CardDescription>
            Klicke auf eine der Kacheln oben, um nach Status zu filtern. Der Brutto-Betrag entspricht dem auf dem Konto erwarteten Eingang.
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
              {filtered.length} von {invoices.length}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:h-10 [&_th]:px-3">
            <TableHeader>
              <TableRow>
                <TableHead>Nummer</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Projekt / Kunde</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead>Fällig</TableHead>
                <TableHead className="text-right">Netto</TableHead>
                <TableHead className="text-right">Brutto</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Bezahlt am</TableHead>
                <TableHead className="w-[220px] text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                    {invoices.length === 0
                      ? "Noch keine Rechnungen angelegt"
                      : "Keine Treffer für die Suche"}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((inv) => {
                const status = invoiceStatus(inv);
                const isOverdue = status === "overdue";
                return (
                  <TableRow
                    key={inv.id}
                    className={cn(isOverdue && "bg-destructive-subtle/60")}
                  >
                    <TableCell className="font-mono text-sm">{inv.number}</TableCell>
                    <TableCell>
                      {inv.kind === "REMINDER" ? (
                        <Badge variant="warning" className="text-[10px]">
                          {labelFor(inv)}
                        </Badge>
                      ) : !inv.paidAt ? (
                        <button
                          type="button"
                          onClick={() => handleTogglePrepayment(inv)}
                          disabled={pending}
                          className={cn(
                            "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors hover:bg-muted disabled:opacity-50",
                            inv.isPrepayment
                              ? "border-info/30 bg-info-subtle text-info"
                              : "border-border"
                          )}
                          title={
                            inv.isPrepayment
                              ? "Klick: auf reguläre Rechnung umstellen"
                              : "Klick: auf Vorkasse umstellen"
                          }
                        >
                          {inv.isPrepayment ? "Vorkasse" : "Rechnung"}
                        </button>
                      ) : (
                        <Badge
                          variant={inv.isPrepayment ? "secondary" : "outline"}
                          className="text-[10px]"
                        >
                          {inv.isPrepayment ? "Vorkasse" : "Rechnung"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link href={`/projects/${inv.projectId}`} className="block hover:underline">
                        <div className="font-medium">{inv.projectName}</div>
                        {inv.customerName && (
                          <div className="text-[11px] text-muted-foreground">{inv.customerName}</div>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(inv.date)}</TableCell>
                    <TableCell className={cn("text-sm", isOverdue && "font-medium text-destructive")}>
                      {formatDate(inv.dueDate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-sm text-muted-foreground">
                      {formatCurrency(inv.totalNet)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-sm font-medium">
                      {formatCurrency(gross(inv))}
                    </TableCell>
                    <TableCell>
                      {status === "paid" && <Badge variant="success" className="text-[10px]">Bezahlt</Badge>}
                      {status === "overdue" && <Badge variant="destructive" className="text-[10px]">Überfällig</Badge>}
                      {status === "open" && <Badge variant="outline" className="text-[10px]">Offen</Badge>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {inv.paidAt ? formatDate(inv.paidAt) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                          <a
                            href={`/api/projects/${inv.projectId}/invoices/${inv.id}/pdf?download=1`}
                            download
                            rel="noopener"
                            title="PDF herunterladen"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                        {inv.paidAt ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMarkUnpaid(inv)}
                            disabled={pending}
                            title="Wieder als unbezahlt markieren"
                          >
                            Storno
                          </Button>
                        ) : (
                          <>
                            <Button variant="outline" size="sm" onClick={() => setPayDialog(inv)}>
                              <CheckCircle2 className="h-4 w-4" /> Bezahlt
                            </Button>
                            {inv.kind === "INVOICE" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCreateReminder(inv)}
                                disabled={pending}
                                title="Mahnung zu dieser Rechnung anlegen"
                              >
                                <AlertTriangle className="h-4 w-4" /> Mahnung
                              </Button>
                            )}
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteDialog(inv)}
                          title="Rechnung löschen"
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
        </CardContent>
      </Card>

      <MarkPaidDialog invoice={payDialog} onClose={() => setPayDialog(null)} />

      <ConfirmDialog
        open={deleteDialog !== null}
        onOpenChange={(o) => !o && setDeleteDialog(null)}
        title="Rechnung löschen?"
        description={
          deleteDialog && (
            <>
              Rechnung <strong>{deleteDialog.number}</strong> über{" "}
              <strong>{formatCurrency(gross(deleteDialog))}</strong> brutto für{" "}
              <strong>{deleteDialog.projectName}</strong> wird unwiderruflich gelöscht. Die Rechnungs-Nummer wird nicht wiederverwendet.
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

function StatCard({
  label,
  amount,
  variant,
  active,
  onClick,
}: {
  label: string;
  amount: number;
  variant: "default" | "destructive" | "success";
  active: boolean;
  onClick: () => void;
}) {
  const colorBase =
    variant === "destructive"
      ? "border-destructive/40 bg-destructive/5 text-destructive"
      : variant === "success"
      ? "border-success/40 bg-success-subtle text-success"
      : "border-border bg-card text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border p-4 text-left transition-colors",
        colorBase,
        active && "ring-2 ring-offset-2 ring-primary"
      )}
    >
      <div className="text-xs font-medium uppercase tracking-wide opacity-80">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">
        {formatCurrency(amount)}
      </div>
    </button>
  );
}

function MarkPaidDialog({
  invoice,
  onClose,
}: {
  invoice: InvoiceVM | null;
  onClose: () => void;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    if (!invoice) return;
    const id = invoice.id;
    const number = invoice.number;
    const paidAt = new Date(date);
    startTransition(async () => {
      try {
        await setInvoicePaid(id, paidAt);
        toast.success(`Rechnung ${number} als bezahlt markiert`);
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  return (
    <Dialog open={invoice !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rechnung als bezahlt markieren</DialogTitle>
          <DialogDescription>
            {invoice && (
              <>
                Rechnung <strong>{invoice.number}</strong> über{" "}
                <strong>{formatCurrency(gross(invoice))}</strong> brutto.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="paidAt">Zahlungsdatum</Label>
          <Input
            id="paidAt"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Abbrechen
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
