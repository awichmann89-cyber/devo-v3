"use client";

import { useState, useTransition } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  FileText,
  Receipt,
  Loader2,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {
  updateGroupDiscount,
  updateProjectDiscount,
  updateBereichDiscount,
  createInvoice,
  deleteInvoice,
  createQuote,
  deleteQuote,
} from "./finances-actions";

export interface FinancesGroupVM {
  id: string;
  name: string;
  kind: "MATERIAL" | "SERVICE";
  subtotal: number;
  discountPercent: number;
  billable: boolean;
}

function invoiceGross(inv: FinancesInvoiceVM): number {
  return inv.totalGross ?? inv.totalNet;
}

/**
 * Lädt das PDF unter `url` direkt herunter, statt es im Browser-Viewer zu
 * öffnen. Funktioniert auch wenn das Backend Content-Disposition: inline
 * setzen würde — wir setzen `download` per Anchor und stoßen einen Klick an.
 * Wird für frisch erstellte Rechnungen/Angebote/Mahnungen genutzt.
 */
function triggerDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export interface FinancesInvoiceVM {
  id: string;
  number: string;
  kind: "INVOICE" | "REMINDER";
  reminderLevel: number;
  date: string;
  dueDate: string;
  totalNet: number;
  totalGross: number | null;
  paidAt: string | null;
  isPrepayment: boolean;
}

export interface FinancesQuoteVM {
  id: string;
  number: string;
  date: string;
  expiresAt: string;
  totalNet: number;
  totalGross: number | null;
}

interface Props {
  projectId: string;
  projectName: string;
  groups: FinancesGroupVM[];
  projectDiscountPercent: number;
  materialDiscountPercent: number;
  servicesDiscountPercent: number;
  invoices: FinancesInvoiceVM[];
  quotes: FinancesQuoteVM[];
  invoiceDueDays: number;
  quoteValidityDays: number;
}

export function FinancesSection({
  projectId,
  projectName,
  groups,
  projectDiscountPercent,
  materialDiscountPercent,
  servicesDiscountPercent,
  invoices,
  quotes,
  invoiceDueDays,
  quoteValidityDays,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [invoiceDialog, setInvoiceDialog] = useState(false);
  const [quoteDialog, setQuoteDialog] = useState(false);
  const [deleteInv, setDeleteInv] = useState<FinancesInvoiceVM | null>(null);
  const [deleteQ, setDeleteQ] = useState<FinancesQuoteVM | null>(null);
  const [expanded, setExpanded] = useState<Set<"MATERIAL" | "SERVICE">>(
    new Set(["MATERIAL", "SERVICE"])
  );

  function toggle(kind: "MATERIAL" | "SERVICE") {
    const s = new Set(expanded);
    if (s.has(kind)) s.delete(kind);
    else s.add(kind);
    setExpanded(s);
  }

  // Berechnungen — defensive Defaults gegen NaN
  function safePct(x: number | null | undefined): number {
    const n = Number(x);
    return isFinite(n) ? n : 0;
  }

  function groupNet(g: FinancesGroupVM) {
    const pct = safePct(g.discountPercent);
    const d = (g.subtotal * pct) / 100;
    return { discount: d, net: g.subtotal - d };
  }

  function bereich(kind: "MATERIAL" | "SERVICE") {
    // ALLE Gruppen anzeigen (auch nicht-abrechenbare),
    // aber Summen nur über abrechenbare bilden.
    const items = groups.filter((g) => g.kind === kind);
    const billableItems = items.filter((g) => g.billable);
    // Zwischensumme = Brutto vor allen Rabatten. Bleibt stabil, wenn
    // Gruppen-Rabatte geändert werden.
    const subtotal = billableItems.reduce((s, g) => s + g.subtotal, 0);
    // Summe der Gruppen-Rabatte (in €) — Bereichs-Rabatt setzt darauf an.
    const groupDiscountsSum = billableItems.reduce(
      (s, g) => s + groupNet(g).discount,
      0
    );
    const afterGroupDiscounts = subtotal - groupDiscountsSum;
    const discountPercent = safePct(
      kind === "MATERIAL" ? materialDiscountPercent : servicesDiscountPercent
    );
    // Bereichs-Rabatt wird auf den um Gruppen-Rabatte reduzierten Wert
    // gerechnet — sonst würde derselbe Betrag doppelt rabattiert.
    const discount = (afterGroupDiscounts * discountPercent) / 100;
    const net = afterGroupDiscounts - discount;
    return {
      items,
      subtotal,
      groupDiscountsSum,
      discountPercent,
      discount,
      net,
    };
  }

  const material = bereich("MATERIAL");
  const services = bereich("SERVICE");

  const subAfterBereichDiscounts = material.net + services.net;
  const projectDiscountAmount =
    (subAfterBereichDiscounts * projectDiscountPercent) / 100;
  const grandTotal = subAfterBereichDiscounts - projectDiscountAmount;

  function handleGroupDiscount(groupId: string, value: string, current: number) {
    const v = Number(value);
    if (!isFinite(v) || v < 0 || v > 100 || v === current) return;
    startTransition(async () => {
      try {
        await updateGroupDiscount(groupId, v);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleBereichDiscount(
    kind: "MATERIAL" | "SERVICE",
    value: string,
    current: number
  ) {
    const v = Number(value);
    if (!isFinite(v) || v < 0 || v > 100 || v === current) return;
    startTransition(async () => {
      try {
        await updateBereichDiscount(projectId, kind, v);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleProjectDiscount(value: string) {
    const v = Number(value);
    if (!isFinite(v) || v < 0 || v > 100 || v === projectDiscountPercent) return;
    startTransition(async () => {
      try {
        await updateProjectDiscount(projectId, v);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleDeleteInvoice() {
    if (!deleteInv) return;
    const id = deleteInv.id;
    startTransition(async () => {
      try {
        await deleteInvoice(id);
        toast.success("Rechnung gelöscht");
        setDeleteInv(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleDeleteQuote() {
    if (!deleteQ) return;
    const id = deleteQ.id;
    startTransition(async () => {
      try {
        await deleteQuote(id);
        toast.success("Angebot gelöscht");
        setDeleteQ(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function BereichRow({
    kind,
    title,
    data,
  }: {
    kind: "MATERIAL" | "SERVICE";
    title: string;
    data: ReturnType<typeof bereich>;
  }) {
    const isExpanded = expanded.has(kind);
    return (
      <>
        <TableRow className="bg-muted/40 hover:bg-muted/60">
          <TableCell className="font-semibold">
            <button
              type="button"
              className="flex items-center gap-1.5"
              onClick={() => toggle(kind)}
              disabled={data.items.length === 0}
            >
              {data.items.length === 0 ? (
                <span className="inline-block w-3.5" />
              ) : isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              {title}
              {data.items.length > 0 && (
                <span className="text-muted-foreground font-normal text-xs">
                  ({data.items.length})
                </span>
              )}
            </button>
          </TableCell>
          <TableCell className="text-right tabular-nums font-mono font-semibold">
            {formatCurrency(data.subtotal)}
          </TableCell>
          <TableCell className="text-right">
            <Input
              type="number"
              step="0.5"
              min="0"
              max="100"
              defaultValue={safePct(data.discountPercent)}
              onBlur={(e) =>
                handleBereichDiscount(kind, e.target.value, data.discountPercent)
              }
              className="h-8 text-right"
              disabled={data.items.length === 0}
            />
          </TableCell>
          <TableCell
            className="text-right tabular-nums text-muted-foreground"
            title={
              data.groupDiscountsSum > 0
                ? `${formatCurrency(data.groupDiscountsSum)} aus Gruppen-Rabatten` +
                  (data.discount > 0
                    ? ` + ${formatCurrency(data.discount)} Bereichs-Rabatt`
                    : "")
                : undefined
            }
          >
            {data.subtotal - data.net > 0
              ? "−" + formatCurrency(data.subtotal - data.net)
              : "—"}
          </TableCell>
          <TableCell className="text-right tabular-nums font-mono font-semibold">
            {formatCurrency(data.net)}
          </TableCell>
        </TableRow>
        {isExpanded &&
          data.items.map((g) => {
            const { discount, net } = groupNet(g);
            const isBillable = g.billable;
            return (
              <TableRow
                key={g.id}
                className={cn(
                  "border-l-2 border-l-transparent",
                  !isBillable && "bg-muted/30 text-muted-foreground"
                )}
              >
                <TableCell className="pl-10 text-sm">
                  <span className={cn(!isBillable && "line-through")}>{g.name}</span>
                  {!isBillable && (
                    <span className="ml-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                      nicht abrechenbar
                    </span>
                  )}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums font-mono text-sm",
                    !isBillable && "line-through"
                  )}
                >
                  {formatCurrency(g.subtotal)}
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    defaultValue={safePct(g.discountPercent)}
                    onBlur={(e) =>
                      handleGroupDiscount(g.id, e.target.value, g.discountPercent)
                    }
                    className="h-8 text-right"
                    disabled={!isBillable}
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground text-sm">
                  {isBillable ? (discount > 0 ? "−" + formatCurrency(discount) : "—") : "—"}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums font-mono text-sm",
                    !isBillable && "line-through"
                  )}
                >
                  {isBillable ? formatCurrency(net) : "—"}
                </TableCell>
              </TableRow>
            );
          })}
      </>
    );
  }

  return (
    <div className="space-y-6">
      {/* Buttons */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" onClick={() => setQuoteDialog(true)}>
          <FileText className="h-4 w-4" /> Angebot erstellen
        </Button>
        <Button onClick={() => setInvoiceDialog(true)}>
          <Receipt className="h-4 w-4" /> Rechnung erstellen
        </Button>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Noch keine Gruppen — leg unter Material oder Personal & Transport
            Gruppen an, um eine Kalkulation aufzubauen.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Übersicht</CardTitle>
            <CardDescription>
              Rabatt pro Gruppe, pro Bereich (Material/Personal & Transport)
              und projektweit — werden in dieser Reihenfolge angewendet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bereich / Gruppe</TableHead>
                  <TableHead className="text-right">Zwischensumme</TableHead>
                  <TableHead className="w-[110px] text-right">Rabatt %</TableHead>
                  <TableHead className="text-right">Rabatt</TableHead>
                  <TableHead className="text-right">Netto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <BereichRow kind="MATERIAL" title="Material" data={material} />
                <BereichRow
                  kind="SERVICE"
                  title="Personal & Transport"
                  data={services}
                />

                {/* Zwischensumme aller Bereiche */}
                <TableRow className="border-t-2">
                  <TableCell className="font-medium">Zwischensumme</TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell />
                  <TableCell className="text-right tabular-nums font-mono font-medium">
                    {formatCurrency(subAfterBereichDiscounts)}
                  </TableCell>
                </TableRow>

                {/* Projektweiter Rabatt */}
                <TableRow>
                  <TableCell className="text-muted-foreground">
                    Projektweiter Rabatt
                  </TableCell>
                  <TableCell />
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      defaultValue={safePct(projectDiscountPercent)}
                      onBlur={(e) => handleProjectDiscount(e.target.value)}
                      className="h-8 text-right"
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {projectDiscountAmount > 0
                      ? "−" + formatCurrency(projectDiscountAmount)
                      : "—"}
                  </TableCell>
                  <TableCell />
                </TableRow>

                {/* Gesamt netto */}
                <TableRow className="border-t-2 bg-muted/40">
                  <TableCell className="font-bold text-base">Gesamt netto</TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell />
                  <TableCell className="text-right tabular-nums font-mono font-bold text-base">
                    {formatCurrency(grandTotal)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {quotes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Erstellte Angebote</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nummer</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Gültig bis</TableHead>
                  <TableHead className="text-right">Netto</TableHead>
                  <TableHead className="text-right">Brutto</TableHead>
                  <TableHead className="w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-mono">{q.number}</TableCell>
                    <TableCell>{formatDate(q.date)}</TableCell>
                    <TableCell>{formatDate(q.expiresAt)}</TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-sm text-muted-foreground">
                      {formatCurrency(q.totalNet)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-sm font-medium">
                      {formatCurrency(q.totalGross ?? q.totalNet)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                          <a
                            href={`/api/projects/${projectId}/quotes/${q.id}/pdf`}
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
                          onClick={() => setDeleteQ(q)}
                          title="Angebot löschen"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {invoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Erstellte Rechnungen</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nummer</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Fällig bis</TableHead>
                  <TableHead className="text-right">Netto</TableHead>
                  <TableHead className="text-right">Brutto</TableHead>
                  <TableHead className="w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono">{inv.number}</TableCell>
                    <TableCell>{formatDate(inv.date)}</TableCell>
                    <TableCell>{formatDate(inv.dueDate)}</TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-sm text-muted-foreground">
                      {formatCurrency(inv.totalNet)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-sm font-medium">
                      {formatCurrency(invoiceGross(inv))}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                          <a
                            href={`/api/projects/${projectId}/invoices/${inv.id}/pdf`}
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
                          onClick={() => setDeleteInv(inv)}
                          title="Rechnung löschen"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <InvoiceDialog
        open={invoiceDialog}
        onOpenChange={setInvoiceDialog}
        projectId={projectId}
        projectName={projectName}
        defaultTotal={grandTotal}
        dueDays={invoiceDueDays}
        existingInvoices={invoices}
      />

      <QuoteDialog
        open={quoteDialog}
        onOpenChange={setQuoteDialog}
        projectId={projectId}
        projectName={projectName}
        defaultTotal={grandTotal}
        validityDays={quoteValidityDays}
        existingQuotes={quotes}
      />

      <ConfirmDialog
        open={deleteInv !== null}
        onOpenChange={(o) => !o && setDeleteInv(null)}
        title="Rechnung löschen?"
        description={
          deleteInv && (
            <>
              Rechnung <strong>{deleteInv.number}</strong> über{" "}
              <strong>{formatCurrency(invoiceGross(deleteInv))}</strong> brutto wird
              gelöscht.
              Die Nummer wird nicht wiederverwendet.
            </>
          )
        }
        confirmLabel="Löschen"
        pending={pending}
        onConfirm={handleDeleteInvoice}
      />

      <ConfirmDialog
        open={deleteQ !== null}
        onOpenChange={(o) => !o && setDeleteQ(null)}
        title="Angebot löschen?"
        description={
          deleteQ && (
            <>
              Angebot <strong>{deleteQ.number}</strong> über{" "}
              <strong>{formatCurrency(deleteQ.totalGross ?? deleteQ.totalNet)}</strong> brutto wird gelöscht.
              Die Nummer wird nicht wiederverwendet.
            </>
          )
        }
        confirmLabel="Löschen"
        pending={pending}
        onConfirm={handleDeleteQuote}
      />
    </div>
  );
}

function InvoiceDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  defaultTotal,
  dueDays,
  existingInvoices,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  projectName: string;
  defaultTotal: number;
  dueDays: number;
  existingInvoices: FinancesInvoiceVM[];
}) {
  const [pending, startTransition] = useTransition();
  // Typ — Default ist immer "Rechnung". Mahnung nur wählbar wenn es eine
  // reguläre Rechnung zum Bemahnen gibt (kind=INVOICE).
  const [kind, setKind] = useState<"INVOICE" | "REMINDER">("INVOICE");
  // Vorkasse-Flag: tauscht im PDF nur das Datums-Label „Rechnungsdatum" →
  // „Vorkasse zum". Beträge bleiben unverändert.
  const [isPrepayment, setIsPrepayment] = useState(false);
  const baseInvoices = existingInvoices.filter((i) => i.kind === "INVOICE");
  const canBeReminder = baseInvoices.length > 0;
  const [reminderTarget, setReminderTarget] = useState<string>(
    baseInvoices[0]?.id ?? ""
  );

  const hasExisting = kind === "INVOICE" && existingInvoices.length > 0;
  const computedDueDate = new Date();
  computedDueDate.setDate(computedDueDate.getDate() + dueDays);

  const selectedOriginal = baseInvoices.find((i) => i.id === reminderTarget);
  const reminderAmount = selectedOriginal
    ? (selectedOriginal.totalGross ?? selectedOriginal.totalNet)
    : 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        if (kind === "REMINDER") {
          if (!reminderTarget) {
            toast.error("Bitte eine Rechnung auswählen, die bemahnt werden soll");
            return;
          }
          const created = await createInvoice(
            projectId,
            computedDueDate,
            0,
            { relatedInvoiceId: reminderTarget }
          );
          toast.success(`Mahnung ${created.number} angelegt`);
          triggerDownload(
            `/api/projects/${projectId}/invoices/${created.id}/pdf?download=1`
          );
        } else {
          if (hasExisting) {
            for (const inv of existingInvoices) {
              await deleteInvoice(inv.id);
            }
          }
          const inv = await createInvoice(
            projectId,
            computedDueDate,
            defaultTotal,
            { isPrepayment }
          );
          toast.success(
            hasExisting
              ? `Rechnung ${inv.number} angelegt (alte überschrieben)`
              : `Rechnung ${inv.number} angelegt`
          );
          triggerDownload(
            `/api/projects/${projectId}/invoices/${inv.id}/pdf?download=1`
          );
        }
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {kind === "REMINDER"
              ? "Mahnung erstellen"
              : hasExisting
                ? "Rechnung überschreiben?"
                : "Rechnung erstellen"}
          </DialogTitle>
          <DialogDescription>
            Für Projekt <strong>{projectName}</strong>. Nummer wird automatisch
            fortlaufend vergeben, Zahlungsfrist aus den Einstellungen.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Typ</Label>
            <Select
              value={kind}
              onValueChange={(v) => setKind(v as "INVOICE" | "REMINDER")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INVOICE">Rechnung</SelectItem>
                <SelectItem value="REMINDER" disabled={!canBeReminder}>
                  Mahnung{!canBeReminder && " (keine Rechnung vorhanden)"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {kind === "INVOICE" && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={isPrepayment}
                onChange={(e) => setIsPrepayment(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              <span>
                <span className="font-medium">Vorkasse</span>
              </span>
            </label>
          )}

          {kind === "REMINDER" && canBeReminder && (
            <div className="space-y-2">
              <Label>Zu bemahnende Rechnung</Label>
              <Select value={reminderTarget} onValueChange={setReminderTarget}>
                <SelectTrigger>
                  <SelectValue placeholder="Rechnung wählen…" />
                </SelectTrigger>
                <SelectContent>
                  {baseInvoices.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      {inv.number} ·{" "}
                      {new Intl.NumberFormat("de-DE", {
                        style: "currency",
                        currency: "EUR",
                      }).format(inv.totalGross ?? inv.totalNet)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {kind === "INVOICE" && hasExisting && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700/40 dark:bg-amber-950/30 p-3 text-xs">
              Es {existingInvoices.length === 1 ? "existiert" : "existieren"} bereits{" "}
              <strong>
                {existingInvoices.length}{" "}
                {existingInvoices.length === 1 ? "Rechnung" : "Rechnungen"}
              </strong>{" "}
              ({existingInvoices.map((i) => i.number).join(", ")}). Beim
              Fortfahren {existingInvoices.length === 1 ? "wird sie" : "werden sie"}{" "}
              gelöscht und eine neue angelegt. Die alten Nummern werden nicht
              wiederverwendet.
            </div>
          )}

          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {kind === "REMINDER" ? "Offener Betrag" : "Rechnungsbetrag"}
              </span>
              <span className="font-mono font-medium tabular-nums">
                {new Intl.NumberFormat("de-DE", {
                  style: "currency",
                  currency: "EUR",
                }).format(kind === "REMINDER" ? reminderAmount : defaultTotal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Zahlbar bis{kind === "INVOICE" && isPrepayment ? "" : ` (${dueDays} Tage)`}
              </span>
              <span className="font-medium">
                {kind === "INVOICE" && isPrepayment
                  ? "Vorkasse"
                  : computedDueDate.toLocaleDateString("de-DE")}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Abbrechen
            </Button>
            <Button
              type="submit"
              disabled={pending || (kind === "REMINDER" && !canBeReminder)}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {kind === "REMINDER"
                ? "Mahnung erstellen"
                : hasExisting
                  ? "Überschreiben"
                  : "Rechnung erstellen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuoteDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  defaultTotal,
  validityDays,
  existingQuotes,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  projectName: string;
  defaultTotal: number;
  validityDays: number;
  existingQuotes: FinancesQuoteVM[];
}) {
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState("");
  const hasExisting = existingQuotes.length > 0;
  const computedExpiresAt = new Date();
  computedExpiresAt.setDate(computedExpiresAt.getDate() + validityDays);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        if (hasExisting) {
          for (const q of existingQuotes) {
            await deleteQuote(q.id);
          }
        }
        const q = await createQuote(
          projectId,
          computedExpiresAt,
          defaultTotal,
          notes
        );
        toast.success(
          hasExisting
            ? `Angebot ${q.number} angelegt (alte überschrieben)`
            : `Angebot ${q.number} angelegt`
        );
        triggerDownload(`/api/projects/${projectId}/quotes/${q.id}/pdf?download=1`);
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {hasExisting ? "Angebot überschreiben?" : "Angebot erstellen"}
          </DialogTitle>
          <DialogDescription>
            Für Projekt <strong>{projectName}</strong>. Nummer wird automatisch
            fortlaufend vergeben, Gültigkeit aus den Einstellungen.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {hasExisting && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700/40 dark:bg-amber-950/30 p-3 text-xs">
              Es {existingQuotes.length === 1 ? "existiert" : "existieren"} bereits{" "}
              <strong>
                {existingQuotes.length}{" "}
                {existingQuotes.length === 1 ? "Angebot" : "Angebote"}
              </strong>{" "}
              ({existingQuotes.map((q) => q.number).join(", ")}). Beim
              Fortfahren {existingQuotes.length === 1 ? "wird es" : "werden sie"}{" "}
              gelöscht und ein neues angelegt. Die alten Nummern werden nicht
              wiederverwendet.
            </div>
          )}
          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Angebotsbetrag</span>
              <span className="font-mono font-medium tabular-nums">
                {new Intl.NumberFormat("de-DE", {
                  style: "currency",
                  currency: "EUR",
                }).format(defaultTotal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Gültig bis ({validityDays} Tage)
              </span>
              <span className="font-medium">
                {computedExpiresAt.toLocaleDateString("de-DE")}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="quote-notes">Hinweis (optional)</Label>
            <Textarea
              id="quote-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Z.B. besondere Konditionen, Auf-/Abbau-Zeiten, individuelle Vereinbarungen…"
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Wird im PDF direkt nach der Positionstabelle ausgegeben, vor
              dem AGB-Hinweis.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {hasExisting ? "Überschreiben" : "Angebot erstellen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
