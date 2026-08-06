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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StatTile, StatTileGrid } from "@/components/ui/stat-tile";
import { ListCard } from "@/components/layout/list-card";
import {
  FilterChips,
  FilterDivider,
  FilterResetButton,
  FilterSearch,
} from "@/components/filters/filter-controls";
import { badgeVariants } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, Download, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {
  invoiceKindLabel,
  invoiceStatus,
  invoiceStatusLabel,
  invoiceStatusVariant,
  type InvoiceStatus,
} from "@/lib/labels";
import { toastError } from "@/lib/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  setInvoicePaid,
  deleteInvoiceFromList,
  createReminderForInvoice,
  setInvoicePrepayment,
} from "./actions";

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

type StatusFilter = "all" | InvoiceStatus;

export function InvoicesTable({ rows: invoices }: { rows: InvoiceVM[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [payDialog, setPayDialog] = useState<InvoiceVM | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<InvoiceVM | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (filter !== "all" && invoiceStatus(inv) !== filter) return false;
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
    const acc = { open: 0, overdue: 0, paid: 0 };
    const counts = { open: 0, overdue: 0, paid: 0 };
    for (const inv of invoices) {
      const s = invoiceStatus(inv);
      acc[s] += gross(inv);
      counts[s] += 1;
    }
    return { ...acc, counts };
  }, [invoices]);

  function handleMarkUnpaid(inv: InvoiceVM) {
    startTransition(async () => {
      try {
        await setInvoicePaid(inv.id, null);
        toast.success(`${invoiceKindLabel(inv)} ${inv.number} wieder als unbezahlt markiert`);
      } catch (e) {
        toastError(e, "Ändern");
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
        toastError(e, "Umstellen");
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
        toastError(e, "Mahnung anlegen");
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
        toastError(e, "Löschen");
      }
    });
  }

  return (
    <div className="space-y-4">
      <StatTileGrid className="lg:grid-cols-3">
        <StatTile
          label="Offen (Brutto)"
          value={formatCurrency(totals.open)}
          hint={`${totals.counts.open} Rechnung(en)`}
          active={filter === "open"}
          onClick={() => setFilter(filter === "open" ? "all" : "open")}
        />
        <StatTile
          label="Überfällig (Brutto)"
          value={formatCurrency(totals.overdue)}
          hint={`${totals.counts.overdue} Rechnung(en)`}
          tone="destructive"
          active={filter === "overdue"}
          onClick={() => setFilter(filter === "overdue" ? "all" : "overdue")}
        />
        <StatTile
          label="Bezahlt (Brutto)"
          value={formatCurrency(totals.paid)}
          hint={`${totals.counts.paid} Rechnung(en)`}
          tone="success"
          active={filter === "paid"}
          onClick={() => setFilter(filter === "paid" ? "all" : "paid")}
        />
      </StatTileGrid>

      <ListCard
        title="Rechnungen"
        info="Die Kacheln oben filtern nach Status. Der Brutto-Betrag entspricht dem auf dem Konto erwarteten Eingang."
        count={{ shown: filtered.length, total: invoices.length }}
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
                { value: "all", label: "Alle", count: invoices.length },
                {
                  value: "open",
                  label: invoiceStatusLabel("open"),
                  tone: badgeVariants({ variant: invoiceStatusVariant("open") }),
                  count: totals.counts.open,
                },
                {
                  value: "overdue",
                  label: invoiceStatusLabel("overdue"),
                  tone: badgeVariants({ variant: invoiceStatusVariant("overdue") }),
                  count: totals.counts.overdue,
                },
                {
                  value: "paid",
                  label: invoiceStatusLabel("paid"),
                  tone: badgeVariants({ variant: invoiceStatusVariant("paid") }),
                  count: totals.counts.paid,
                },
              ]}
            />
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
              <TableEmpty
                colSpan={10}
                hasData={invoices.length > 0}
                entity="Rechnungen"
                emptyText="Noch keine Rechnungen angelegt. Rechnungen entstehen im Finanzen-Tab eines Projekts."
              />
            )}
            {filtered.map((inv) => {
              const status = invoiceStatus(inv);
              const isOverdue = status === "overdue";
              return (
                <TableRow key={inv.id} className={cn(isOverdue && "bg-destructive-subtle/60")}>
                  <TableCell className="num">{inv.number}</TableCell>
                  <TableCell>
                    {inv.kind === "REMINDER" ? (
                      <Badge variant="warning" size="sm">
                        {invoiceKindLabel(inv)}
                      </Badge>
                    ) : !inv.paidAt ? (
                      // Umschaltbar, solange unbezahlt — sieht aus wie ein Badge,
                      // weil es dieselbe Information trägt.
                      <Badge
                        asChild
                        variant={inv.isPrepayment ? "info" : "outline"}
                        size="sm"
                      >
                        <button
                          type="button"
                          onClick={() => handleTogglePrepayment(inv)}
                          disabled={pending}
                          className="transition-colors hover:opacity-80 disabled:opacity-50"
                          title={
                            inv.isPrepayment
                              ? "Klick: auf reguläre Rechnung umstellen"
                              : "Klick: auf Vorkasse umstellen"
                          }
                        >
                          {inv.isPrepayment ? "Vorkasse" : "Rechnung"}
                        </button>
                      </Badge>
                    ) : (
                      <Badge variant={inv.isPrepayment ? "info" : "outline"} size="sm">
                        {inv.isPrepayment ? "Vorkasse" : "Rechnung"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link href={`/projects/${inv.projectId}`} className="block hover:underline">
                      <div className="font-medium">{inv.projectName}</div>
                      {inv.customerName && (
                        <div className="text-[11px] text-muted-foreground">
                          {inv.customerName}
                        </div>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell>{formatDate(inv.date)}</TableCell>
                  <TableCell className={cn(isOverdue && "font-medium text-destructive")}>
                    {formatDate(inv.dueDate)}
                  </TableCell>
                  <TableCell className="num text-right text-muted-foreground">
                    {formatCurrency(inv.totalNet)}
                  </TableCell>
                  <TableCell className="num-strong text-right">
                    {formatCurrency(gross(inv))}
                  </TableCell>
                  <TableCell>
                    <Badge variant={invoiceStatusVariant(status)} size="sm">
                      {invoiceStatusLabel(status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {inv.paidAt ? (
                      formatDate(inv.paidAt)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
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
                      <RowActions density="compact">
                        <RowAction
                          icon={Download}
                          label="PDF herunterladen"
                          download={{
                            href: `/api/projects/${inv.projectId}/invoices/${inv.id}/pdf?download=1`,
                            fileName: true,
                          }}
                        />
                        <RowAction
                          icon={Trash2}
                          label="Rechnung löschen"
                          destructive
                          onClick={() => setDeleteDialog(inv)}
                        />
                      </RowActions>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ListCard>

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
        toastError(e, "Speichern");
      }
    });
  }

  return (
    <Dialog open={invoice !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Rechnung als bezahlt markieren</DialogTitle>
          <DialogDescription>
            {invoice ? (
              <>
                Rechnung <strong>{invoice.number}</strong> über{" "}
                <strong>{formatCurrency(gross(invoice))}</strong> brutto.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="paidAt">Zahlungsdatum</Label>
          <Input
            id="paidAt"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            autoFocus
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
