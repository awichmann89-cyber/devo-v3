"use client";

import { useEffect, useState, useTransition } from "react";
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
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Receipt,
  Loader2,
  Trash2,
  Download,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
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
  createReplacementQuote,
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
  /** Bei Vorkasse-Rechnungen: Anteil des Gesamtauftrags in %. */
  prepaymentPercent: number | null;
  /** Schlussrechnung (mit Abzug bestehender Vorkasse-Rechnungen). */
  isFinal: boolean;
}

export interface FinancesQuoteVM {
  id: string;
  number: string;
  date: string;
  expiresAt: string;
  totalNet: number;
  totalGross: number | null;
  /** Annahme-Zustand: ISO-String wenn angenommen, sonst null. */
  acceptedAt: string | null;
  acceptedByName: string | null;
  /** Wenn gesetzt, ist dieses Angebot durch ein neueres ersetzt. */
  supersededByQuoteId: string | null;
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
  /** Interne Zusatzkosten (Zumietung + Extrakosten) für die Ergebnis-Ansicht. */
  subhireTotal: number;
  extraPersonal: number;
  extraOther: number;
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
  subhireTotal,
  extraPersonal,
  extraOther,
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

  // ----- Interne Ergebnis-Rechnung (Umsatz abzgl. Zusatzkosten) -----
  const extraCostTotal = extraPersonal + extraOther;
  const additionalCosts = subhireTotal + extraCostTotal;
  const result = grandTotal - additionalCosts;
  const marginPct = grandTotal > 0 ? (result / grandTotal) * 100 : null;
  const showResult = additionalCosts > 0 || grandTotal > 0;

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

      {showResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Ergebnis nach Zusatzkosten
            </CardTitle>
            <CardDescription>
              Interne Gewinnkontrolle: Umsatz abzüglich Zumietungen und
              Extrakosten. Diese Kosten erscheinen nicht auf Angeboten oder
              Rechnungen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Umsatz (Netto)</TableCell>
                  <TableCell className="text-right tabular-nums font-mono font-medium">
                    {formatCurrency(grandTotal)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">
                    Zumietkosten
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono text-muted-foreground">
                    {subhireTotal > 0 ? "−" + formatCurrency(subhireTotal) : "—"}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">
                    Extrakosten Personal
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono text-muted-foreground">
                    {extraPersonal > 0 ? "−" + formatCurrency(extraPersonal) : "—"}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">
                    Extrakosten Sonstiges
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono text-muted-foreground">
                    {extraOther > 0 ? "−" + formatCurrency(extraOther) : "—"}
                  </TableCell>
                </TableRow>
                <TableRow
                  className={cn(
                    "border-t-2",
                    result >= 0
                      ? "bg-green-50/60 dark:bg-green-950/20"
                      : "bg-red-50/70 dark:bg-red-950/25"
                  )}
                >
                  <TableCell className="font-bold text-base">
                    Ergebnis
                    {marginPct !== null && (
                      <span
                        className={cn(
                          "ml-2 text-xs font-medium",
                          result >= 0 ? "text-green-700 dark:text-green-400" : "text-destructive"
                        )}
                      >
                        Marge {marginPct.toFixed(1)} %
                      </span>
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums font-mono font-bold text-base",
                      result >= 0
                        ? "text-green-700 dark:text-green-400"
                        : "text-destructive"
                    )}
                  >
                    {formatCurrency(result)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            {result < 0 && (
              <p className="mt-3 text-xs font-medium text-destructive">
                Achtung: Die Zusatzkosten übersteigen den Umsatz — dieses Projekt
                ist aktuell nicht profitabel.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {quotes.length > 0 && (
        <QuotesCard
          quotes={quotes}
          projectId={projectId}
          onDelete={(q) => setDeleteQ(q)}
        />
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
                    <TableCell className="font-mono">
                      <span className="flex items-center gap-2">
                        {inv.number}
                        {inv.prepaymentPercent !== null && (
                          <Badge variant="secondary" className="text-[10px]">
                            Vorkasse {inv.prepaymentPercent}%
                          </Badge>
                        )}
                        {inv.isFinal && (
                          <Badge variant="outline" className="text-[10px]">
                            Schlussrechnung
                          </Badge>
                        )}
                      </span>
                    </TableCell>
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
                            href={`/api/projects/${projectId}/invoices/${inv.id}/pdf?download=1`}
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
        // Nur die aktiven (nicht ersetzten) Quotes als "existingQuotes" durchreichen —
        // beim Überschreiben sollen nur diese als ersetzt markiert werden, nicht
        // alte schon-überschriebene erneut anfassen.
        existingQuotes={quotes.filter((q) => !q.supersededByQuoteId)}
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
  // Rechnungsart innerhalb kind=INVOICE.
  const [invoiceMode, setInvoiceMode] = useState<"FULL" | "PREPAYMENT" | "FINAL">(
    "FULL"
  );
  const [prepaymentPercent, setPrepaymentPercent] = useState<number>(50);
  // Beim Überschreiben vorbelegte Rechnungsnummer — standardmäßig die Nummer
  // der ersetzten Rechnung, damit die neue Rechnung dieselbe Nummer behält
  // statt eine neue zu ziehen. Manuell änderbar (z.B. um eine zuvor falsch
  // vergebene Nummer nachträglich zu korrigieren).
  const [customNumber, setCustomNumber] = useState<string>("");
  const [customNumberTouched, setCustomNumberTouched] = useState(false);
  const baseInvoices = existingInvoices.filter((i) => i.kind === "INVOICE");
  const canBeReminder = baseInvoices.length > 0;
  const [reminderTarget, setReminderTarget] = useState<string>(
    baseInvoices[0]?.id ?? ""
  );

  // Vorhandene Vorkasse-Rechnungen (für die Schlussrechnung) und einfache
  // Vollrechnungen (die beim Neu-Anlegen einer Vollrechnung überschrieben werden).
  const prepayments = existingInvoices.filter(
    (i) => i.kind === "INVOICE" && i.prepaymentPercent !== null
  );
  const hasPrepayments = prepayments.length > 0;
  const prepaidNet = prepayments.reduce((s, p) => s + p.totalNet, 0);
  const plainInvoices = existingInvoices.filter(
    (i) => i.kind === "INVOICE" && i.prepaymentPercent === null && !i.isFinal
  );
  // Überschreiben nur bei einer normalen Vollrechnung, und nur die anderen
  // Vollrechnungen (Vorkasse-/Schlussrechnungen bleiben unangetastet).
  const willOverwrite =
    kind === "INVOICE" && invoiceMode === "FULL" && plainInvoices.length > 0;
  // Default für die Rechnungsnummer beim Überschreiben: die Nummer der
  // ersetzten Rechnung, damit die neue Rechnung standardmäßig dieselbe
  // Nummer behält statt eine neue zu ziehen.
  const overwriteDefaultNumber = plainInvoices[0]?.number ?? "";
  useEffect(() => {
    if (willOverwrite) {
      if (!customNumberTouched) setCustomNumber(overwriteDefaultNumber);
    } else {
      setCustomNumber("");
      setCustomNumberTouched(false);
    }
  }, [willOverwrite, overwriteDefaultNumber, customNumberTouched]);

  const computedDueDate = new Date();
  computedDueDate.setDate(computedDueDate.getDate() + dueDays);

  const selectedOriginal = baseInvoices.find((i) => i.id === reminderTarget);
  const reminderAmount = selectedOriginal
    ? (selectedOriginal.totalGross ?? selectedOriginal.totalNet)
    : 0;

  // Netto-Vorschaubetrag je Rechnungsart.
  const pct = Math.max(0, Math.min(100, Number(prepaymentPercent) || 0));
  const previewNet =
    invoiceMode === "PREPAYMENT"
      ? Math.round(((defaultTotal * pct) / 100) * 100) / 100
      : invoiceMode === "FINAL"
        ? Math.round((defaultTotal - prepaidNet) * 100) / 100
        : defaultTotal;

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
        } else if (invoiceMode === "PREPAYMENT") {
          if (pct <= 0) {
            toast.error("Bitte einen Prozentsatz größer als 0 angeben");
            return;
          }
          const inv = await createInvoice(projectId, computedDueDate, defaultTotal, {
            prepaymentPercent: pct,
          });
          toast.success(`Vorkasse-Rechnung ${inv.number} (${pct}%) angelegt`);
          triggerDownload(
            `/api/projects/${projectId}/invoices/${inv.id}/pdf?download=1`
          );
        } else if (invoiceMode === "FINAL") {
          const inv = await createInvoice(projectId, computedDueDate, defaultTotal, {
            isFinal: true,
          });
          toast.success(`Schlussrechnung ${inv.number} angelegt`);
          triggerDownload(
            `/api/projects/${projectId}/invoices/${inv.id}/pdf?download=1`
          );
        } else {
          // Vollrechnung — vorhandene einfache Vollrechnungen überschreiben.
          if (willOverwrite) {
            const trimmedNumber = customNumber.trim();
            if (!trimmedNumber) {
              toast.error("Bitte eine Rechnungsnummer angeben");
              return;
            }
            for (const inv of plainInvoices) {
              await deleteInvoice(inv.id);
            }
          }
          const inv = await createInvoice(projectId, computedDueDate, defaultTotal, {
            customNumber: willOverwrite ? customNumber.trim() : undefined,
          });
          toast.success(
            willOverwrite
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
              : invoiceMode === "PREPAYMENT"
                ? "Vorkasse-Rechnung erstellen"
                : invoiceMode === "FINAL"
                  ? "Schlussrechnung erstellen"
                  : willOverwrite
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
            <div className="space-y-2">
              <Label>Rechnungsart</Label>
              <Select
                value={invoiceMode}
                onValueChange={(v) =>
                  setInvoiceMode(v as "FULL" | "PREPAYMENT" | "FINAL")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FULL">Vollständige Rechnung</SelectItem>
                  <SelectItem value="PREPAYMENT">Vorkasse / Anzahlung (%)</SelectItem>
                  <SelectItem value="FINAL" disabled={!hasPrepayments}>
                    Schlussrechnung{!hasPrepayments && " (keine Vorkasse vorhanden)"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {kind === "INVOICE" && invoiceMode === "PREPAYMENT" && (
            <div className="space-y-2">
              <Label htmlFor="prepay-pct">Anteil des Gesamtauftrags (%)</Label>
              <Input
                id="prepay-pct"
                type="number"
                min={1}
                max={100}
                step="1"
                value={prepaymentPercent}
                onChange={(e) =>
                  setPrepaymentPercent(
                    Math.max(0, Math.min(100, Number(e.target.value) || 0))
                  )
                }
                className="tabular-nums"
              />
              <p className="text-[11px] text-muted-foreground">
                Bei unter 100% kannst du später eine Schlussrechnung erstellen,
                die diese Vorkasse abzieht.
              </p>
            </div>
          )}

          {kind === "INVOICE" && invoiceMode === "FINAL" && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
              <div className="font-medium">Abzüge (bereits berechnete Vorkasse):</div>
              {prepayments.map((p) => (
                <div key={p.id} className="flex justify-between text-muted-foreground">
                  <span>
                    {p.number}
                    {p.prepaymentPercent !== null && ` (${p.prepaymentPercent}%)`}
                  </span>
                  <span className="font-mono tabular-nums">
                    −{formatCurrency(p.totalNet)} netto
                  </span>
                </div>
              ))}
            </div>
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

          {willOverwrite && (
            <>
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700/40 dark:bg-amber-950/30 p-3 text-xs">
                Es {plainInvoices.length === 1 ? "existiert" : "existieren"} bereits{" "}
                <strong>
                  {plainInvoices.length}{" "}
                  {plainInvoices.length === 1 ? "Vollrechnung" : "Vollrechnungen"}
                </strong>{" "}
                ({plainInvoices.map((i) => i.number).join(", ")}). Beim Fortfahren{" "}
                {plainInvoices.length === 1 ? "wird sie" : "werden sie"} gelöscht und
                eine neue mit der unten angegebenen Nummer angelegt.
                Vorkasse-/Schlussrechnungen bleiben erhalten.
              </div>
              <div className="space-y-2">
                <Label htmlFor="overwrite-number">Rechnungsnummer</Label>
                <Input
                  id="overwrite-number"
                  value={customNumber}
                  onChange={(e) => {
                    setCustomNumberTouched(true);
                    setCustomNumber(e.target.value);
                  }}
                  placeholder={overwriteDefaultNumber}
                />
                <p className="text-[11px] text-muted-foreground">
                  Standardmäßig die Nummer der ersetzten Rechnung, damit die
                  Nummer beim Überschreiben erhalten bleibt. Bei Bedarf anpassbar.
                </p>
              </div>
            </>
          )}

          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {kind === "REMINDER"
                  ? "Offener Betrag"
                  : invoiceMode === "PREPAYMENT"
                    ? `Anzahlungsbetrag (${pct}% netto)`
                    : invoiceMode === "FINAL"
                      ? "Restbetrag (netto)"
                      : "Rechnungsbetrag (netto)"}
              </span>
              <span className="font-mono font-medium tabular-nums">
                {formatCurrency(kind === "REMINDER" ? reminderAmount : previewNet)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Zahlbar bis
                {kind === "INVOICE" && invoiceMode === "PREPAYMENT"
                  ? ""
                  : ` (${dueDays} Tage)`}
              </span>
              <span className="font-medium">
                {kind === "INVOICE" && invoiceMode === "PREPAYMENT"
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
              disabled={
                pending ||
                (kind === "REMINDER" && !canBeReminder) ||
                (willOverwrite && !customNumber.trim())
              }
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {kind === "REMINDER"
                ? "Mahnung erstellen"
                : invoiceMode === "PREPAYMENT"
                  ? "Vorkasse-Rechnung erstellen"
                  : invoiceMode === "FINAL"
                    ? "Schlussrechnung erstellen"
                    : willOverwrite
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
        let q: { id: string; number: string };
        if (hasExisting) {
          // Statt das alte Angebot zu löschen und ein neues anzulegen,
          // markieren wir die alten Angebote nun als „ersetzt durch X" via
          // createReplacementQuote. So bleiben die alten Public-URLs
          // (acceptToken) gültig und leiten den Kunden auf die neue Version.
          q = await createReplacementQuote(
            projectId,
            computedExpiresAt,
            defaultTotal,
            notes,
            existingQuotes.map((eq) => eq.id),
          );
        } else {
          q = await createQuote(
            projectId,
            computedExpiresAt,
            defaultTotal,
            notes,
          );
        }
        toast.success(
          hasExisting
            ? `Angebot ${q.number} angelegt (alte ersetzt)`
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

/**
 * Eigene Card-Komponente für die Quotes-Liste — implementiert den
 * Supersession-Filter (ersetzte Angebote ausblenden) und das Acceptance-Badge.
 * Beim Klick auf "Ersetzte zeigen" werden auch die durch neuere Versionen
 * abgelösten Quotes mit reduzierter Opazität dargestellt.
 */
function QuotesCard({
  quotes,
  projectId,
  onDelete,
}: {
  quotes: FinancesQuoteVM[];
  projectId: string;
  onDelete: (q: FinancesQuoteVM) => void;
}) {
  const [showSuperseded, setShowSuperseded] = useState(false);
  const supersededCount = quotes.filter((q) => q.supersededByQuoteId).length;
  const visible = showSuperseded
    ? quotes
    : quotes.filter((q) => !q.supersededByQuoteId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Erstellte Angebote</CardTitle>
        {supersededCount > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showSuperseded}
              onChange={(e) => setShowSuperseded(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Ersetzte zeigen ({supersededCount})
          </label>
        )}
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
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((q) => {
              const isSuperseded = !!q.supersededByQuoteId;
              return (
                <TableRow
                  key={q.id}
                  className={cn(isSuperseded && "opacity-60")}
                >
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
                    {isSuperseded ? (
                      <Badge variant="secondary" className="text-[10px]">
                        Ersetzt
                      </Badge>
                    ) : q.acceptedAt ? (
                      <Badge
                        variant="default"
                        className="gap-1 bg-emerald-600 text-[10px] hover:bg-emerald-600"
                        title={
                          q.acceptedByName
                            ? `Angenommen am ${formatDate(q.acceptedAt)} von ${q.acceptedByName}`
                            : `Angenommen am ${formatDate(q.acceptedAt)}`
                        }
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        Angenommen
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        Offen
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                        <a
                          href={`/api/projects/${projectId}/quotes/${q.id}/pdf?download=1`}
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
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => onDelete(q)}
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
      </CardContent>
    </Card>
  );
}
