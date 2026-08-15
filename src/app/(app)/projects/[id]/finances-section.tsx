"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
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
  Mail,
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
  sendQuoteEmail,
  sendInvoiceEmail,
} from "./finances-actions";
import { toastError } from "@/lib/toast";
import { useTransitionSaveStatus } from "@/lib/use-auto-save";
import { AutoSaveIndicator } from "@/components/ui/auto-save-indicator";
import { fillTemplate } from "@/lib/email-template";

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
  /** Letzter Versand per E-Mail aus der App — ISO-String, sonst null. */
  emailSentAt: string | null;
  emailSentTo: string | null;
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
  /** Letzter Versand per E-Mail aus der App — ISO-String, sonst null. */
  emailSentAt: string | null;
  emailSentTo: string | null;
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
  /** Personalkosten aus dem Einsatzplan (Freelancer-Sätze + Minijobber-Stunden). */
  personnelCost: number;
  /** Default-Empfänger für den "Per E-Mail senden"-Dialog. */
  customerEmail: string | null;
  customerName: string | null;
  /** E-Mail des angemeldeten Nutzers — geht immer als Kopie mit. */
  currentUserEmail: string;
  quoteEmailSubjectTemplate: string;
  quoteEmailBodyTemplate: string;
  invoiceEmailSubjectTemplate: string;
  invoiceEmailBodyTemplate: string;
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
  personnelCost,
  customerEmail,
  customerName,
  currentUserEmail,
  quoteEmailSubjectTemplate,
  quoteEmailBodyTemplate,
  invoiceEmailSubjectTemplate,
  invoiceEmailBodyTemplate,
}: Props) {
  const [pending, startTransition] = useTransition();
  const saveStatus = useTransitionSaveStatus(pending);
  const [invoiceDialog, setInvoiceDialog] = useState(false);
  const [quoteDialog, setQuoteDialog] = useState(false);
  const [deleteInv, setDeleteInv] = useState<FinancesInvoiceVM | null>(null);
  const [deleteQ, setDeleteQ] = useState<FinancesQuoteVM | null>(null);
  // Nach dem Erstellen eines Angebots/einer Rechnung: Wahl zwischen
  // Herunterladen und Per-E-Mail-Senden (siehe SendOrDownloadDialog unten).
  const [sendDoc, setSendDoc] = useState<
    { kind: "quote" | "invoice"; id: string; number: string } | null
  >(null);
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
  const additionalCosts = subhireTotal + extraCostTotal + personnelCost;
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
        toastError(e, "Speichern");
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
        toastError(e, "Speichern");
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
        toastError(e, "Speichern");
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
        toastError(e, "Löschen");
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
        toastError(e, "Löschen");
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
          <TableCell className="text-right num font-semibold">
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
              className="ml-auto h-7 w-[72px] px-1.5 num text-right text-xs"
              disabled={data.items.length === 0}
            />
          </TableCell>
          <TableCell
            className="text-right num text-muted-foreground"
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
          <TableCell className="text-right num font-semibold">
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
                <TableCell className="!pl-8 text-sm">
                  <span className={cn(!isBillable && "line-through")}>{g.name}</span>
                  {!isBillable && (
                    <Badge variant="warning" size="sm" className="ml-2">
                      nicht abrechenbar
                    </Badge>
                  )}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right num text-sm",
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
                    className="ml-auto h-7 w-[72px] px-1.5 num text-right text-xs"
                    disabled={!isBillable}
                  />
                </TableCell>
                <TableCell className="text-right num text-muted-foreground text-sm">
                  {isBillable ? (discount > 0 ? "−" + formatCurrency(discount) : "—") : "—"}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right num text-sm",
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
    <div className="space-y-4">
      {/* Buttons */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* Rabatt-Felder speichern beim Verlassen des Feldes. */}
        <AutoSaveIndicator status={saveStatus} className="mr-auto" />
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
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Übersicht
              <InfoHint text="Rabatt pro Gruppe, pro Bereich (Material/Personal & Transport) und projektweit — werden in dieser Reihenfolge angewendet." />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table density="dense">
              <TableHeader>
                <TableRow className="hover:bg-secondary">
                  <TableHead>Bereich / Gruppe</TableHead>
                  <TableHead className="w-[130px] text-right">Zwischensumme</TableHead>
                  <TableHead className="w-[90px] text-right">Rabatt %</TableHead>
                  <TableHead className="w-[110px] text-right">Rabatt</TableHead>
                  <TableHead className="w-[130px] text-right">Netto</TableHead>
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
                  <TableCell className="text-right num-strong">
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
                      className="ml-auto h-7 w-[72px] px-1.5 num text-right text-xs"
                    />
                  </TableCell>
                  <TableCell className="text-right num text-muted-foreground">
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
                  <TableCell className="text-right num font-bold text-base">
                    {formatCurrency(grandTotal)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {showResult && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Ergebnis nach Zusatzkosten
              <InfoHint text="Interne Gewinnkontrolle: Umsatz abzüglich Zumietungen, Personal aus dem Einsatzplan und manuellen Extrakosten. Diese Kosten erscheinen nicht auf Angeboten oder Rechnungen." />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table density="dense" className="border-t">
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Umsatz (Netto)</TableCell>
                  <TableCell className="text-right num-strong">
                    {formatCurrency(grandTotal)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">
                    Zumietkosten
                  </TableCell>
                  <TableCell className="text-right num text-muted-foreground">
                    {subhireTotal > 0 ? "−" + formatCurrency(subhireTotal) : "—"}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">
                    Personal (Einsatzplan)
                  </TableCell>
                  <TableCell className="text-right num text-muted-foreground">
                    {personnelCost > 0 ? "−" + formatCurrency(personnelCost) : "—"}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">
                    Extrakosten (manuell)
                  </TableCell>
                  <TableCell className="text-right num text-muted-foreground">
                    {extraCostTotal > 0 ? "−" + formatCurrency(extraCostTotal) : "—"}
                  </TableCell>
                </TableRow>
                <TableRow
                  className={cn(
                    "border-t-2",
                    result >= 0
                      ? "bg-success-subtle"
                      : "bg-destructive-subtle"
                  )}
                >
                  <TableCell className="font-bold text-base">
                    Ergebnis
                    {marginPct !== null && (
                      <span
                        className={cn(
                          "ml-2 text-xs font-medium",
                          result >= 0 ? "text-success" : "text-destructive"
                        )}
                      >
                        Marge {marginPct.toFixed(1)} %
                      </span>
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right num font-bold text-base",
                      result >= 0
                        ? "text-success"
                        : "text-destructive"
                    )}
                  >
                    {formatCurrency(result)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            {result < 0 && (
              <p className="border-t px-2 py-1.5 text-xs font-medium text-destructive">
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
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Erstellte Rechnungen</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table density="dense">
              <TableHeader>
                <TableRow className="hover:bg-secondary">
                  <TableHead>Nummer</TableHead>
                  <TableHead className="w-[100px]">Datum</TableHead>
                  <TableHead className="w-[100px]">Fällig bis</TableHead>
                  <TableHead className="w-[110px] text-right">Netto</TableHead>
                  <TableHead className="w-[110px] text-right">Brutto</TableHead>
                  <TableHead className="w-[76px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono">
                      <span className="flex items-center gap-2">
                        {inv.number}
                        {inv.prepaymentPercent !== null && (
                          <Badge variant="secondary" size="sm">
                            Vorkasse {inv.prepaymentPercent}%
                          </Badge>
                        )}
                        {inv.isFinal && (
                          <Badge variant="outline" size="sm">
                            Schlussrechnung
                          </Badge>
                        )}
                        {inv.emailSentAt && (
                          <Badge
                            variant="secondary"
                            size="sm"
                            className="gap-1"
                            title={`Per E-Mail versendet am ${formatDate(inv.emailSentAt)}${inv.emailSentTo ? ` an ${inv.emailSentTo}` : ""}`}
                          >
                            <Mail className="h-3 w-3" /> Versendet
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>{formatDate(inv.date)}</TableCell>
                    <TableCell>{formatDate(inv.dueDate)}</TableCell>
                    <TableCell className="text-right num text-sm text-muted-foreground">
                      {formatCurrency(inv.totalNet)}
                    </TableCell>
                    <TableCell className="text-right num text-sm font-medium">
                      {formatCurrency(invoiceGross(inv))}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button asChild variant="ghost" size="iconXs" >
                          <a
                            href={`/api/projects/${projectId}/invoices/${inv.id}/pdf?download=1`}
                            download
                            rel="noopener"
                            title="PDF herunterladen"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="iconXs"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteInv(inv)}
                          title="Rechnung löschen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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
        onCreated={(id, number) => setSendDoc({ kind: "invoice", id, number })}
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
        onCreated={(id, number) => setSendDoc({ kind: "quote", id, number })}
      />

      <SendOrDownloadDialog
        open={sendDoc !== null}
        onOpenChange={(o) => !o && setSendDoc(null)}
        kind={sendDoc?.kind ?? null}
        documentId={sendDoc?.id ?? null}
        documentNumber={sendDoc?.number ?? null}
        projectId={projectId}
        defaultTo={customerEmail ?? ""}
        currentUserEmail={currentUserEmail}
        subjectTemplate={
          sendDoc?.kind === "invoice"
            ? invoiceEmailSubjectTemplate
            : quoteEmailSubjectTemplate
        }
        bodyTemplate={
          sendDoc?.kind === "invoice"
            ? invoiceEmailBodyTemplate
            : quoteEmailBodyTemplate
        }
        templateVars={{
          kunde: customerName ?? "",
          nummer: sendDoc?.number ?? "",
          projekt: projectName,
        }}
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
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  projectName: string;
  defaultTotal: number;
  dueDays: number;
  existingInvoices: FinancesInvoiceVM[];
  onCreated: (id: string, number: string) => void;
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
          onCreated(created.id, created.number);
        } else if (invoiceMode === "PREPAYMENT") {
          if (pct <= 0) {
            toast.error("Bitte einen Prozentsatz größer als 0 angeben");
            return;
          }
          const inv = await createInvoice(projectId, computedDueDate, defaultTotal, {
            prepaymentPercent: pct,
          });
          toast.success(`Vorkasse-Rechnung ${inv.number} (${pct}%) angelegt`);
          onCreated(inv.id, inv.number);
        } else if (invoiceMode === "FINAL") {
          const inv = await createInvoice(projectId, computedDueDate, defaultTotal, {
            isFinal: true,
          });
          toast.success(`Schlussrechnung ${inv.number} angelegt`);
          onCreated(inv.id, inv.number);
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
          onCreated(inv.id, inv.number);
        }
        onOpenChange(false);
      } catch (e) {
        toastError(e, "Speichern");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
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
                className="num"
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
                  <span className="num">
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
              <div className="rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs">
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
              <span className="num-strong">
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
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  projectName: string;
  defaultTotal: number;
  validityDays: number;
  existingQuotes: FinancesQuoteVM[];
  onCreated: (id: string, number: string) => void;
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
        onCreated(q.id, q.number);
        onOpenChange(false);
      } catch (e) {
        toastError(e, "Speichern");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
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
            <div className="rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs">
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
              <span className="num-strong">
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
            <div className="flex items-center gap-1.5">
              <Label htmlFor="quote-notes">Hinweis (optional)</Label>
              <InfoHint text="Wird im PDF direkt nach der Positionstabelle ausgegeben, vor dem AGB-Hinweis." />
            </div>
            <Textarea
              id="quote-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Z.B. besondere Konditionen, Auf-/Abbau-Zeiten, individuelle Vereinbarungen…"
              rows={4}
            />
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
 * Wird direkt nach dem Erstellen eines Angebots/einer Rechnung geöffnet:
 * erste Wahl zwischen Herunterladen und Per-E-Mail-Senden. Bei Letzterem
 * klappt ein Formular auf, vorbefüllt aus den globalen Textvorlagen
 * (Platzhalter bereits ersetzt) — vor dem Versand noch editierbar. Kopie
 * geht immer automatisch an den angemeldeten Nutzer (siehe sendQuoteEmail/
 * sendInvoiceEmail).
 */
function SendOrDownloadDialog({
  open,
  onOpenChange,
  kind,
  documentId,
  documentNumber,
  projectId,
  defaultTo,
  currentUserEmail,
  subjectTemplate,
  bodyTemplate,
  templateVars,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: "quote" | "invoice" | null;
  documentId: string | null;
  documentNumber: string | null;
  projectId: string;
  defaultTo: string;
  currentUserEmail: string;
  subjectTemplate: string;
  bodyTemplate: string;
  templateVars: Record<string, string>;
}) {
  const [mode, setMode] = useState<"choose" | "email">("choose");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  // Bei jedem neu erstellten Dokument zurücksetzen und aus den Vorlagen
  // (mit ersetzten Platzhaltern) vorbefüllen.
  useEffect(() => {
    if (!open) return;
    setMode("choose");
    setTo(defaultTo);
    setSubject(fillTemplate(subjectTemplate, templateVars));
    setBody(fillTemplate(bodyTemplate, templateVars));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, documentId]);

  if (!kind || !documentId || !documentNumber) return null;

  const label = kind === "quote" ? "Angebot" : "Rechnung";
  const pdfUrl = `/api/projects/${projectId}/${kind === "quote" ? "quotes" : "invoices"}/${documentId}/pdf?download=1`;

  function handleDownload() {
    triggerDownload(pdfUrl);
    onOpenChange(false);
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        if (kind === "quote") {
          await sendQuoteEmail(documentId!, to, subject, body);
        } else {
          await sendInvoiceEmail(documentId!, to, subject, body);
        }
        toast.success(`${label} ${documentNumber} per E-Mail versendet`);
        onOpenChange(false);
      } catch (err) {
        toastError(err, "Versenden");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>
            {label} {documentNumber}
          </DialogTitle>
          <DialogDescription>
            {mode === "choose"
              ? "Herunterladen oder direkt per E-Mail versenden."
              : `Kopie geht automatisch an dich (${currentUserEmail}).`}
          </DialogDescription>
        </DialogHeader>

        {mode === "choose" ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={handleDownload}
            >
              <Download className="h-4 w-4" /> Herunterladen
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={() => setMode("email")}
            >
              <Mail className="h-4 w-4" /> Per E-Mail senden
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSend} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="send-to">An</Label>
              <Input
                id="send-to"
                type="email"
                required
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="kunde@beispiel.de"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="send-subject">Betreff</Label>
              <Input
                id="send-subject"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="send-body">Text</Label>
              <Textarea
                id="send-body"
                rows={8}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMode("choose")}
                disabled={pending}
              >
                Zurück
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Senden
              </Button>
            </DialogFooter>
          </form>
        )}
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
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Erstellte Angebote</CardTitle>
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
      <CardContent className="p-0">
        <Table density="dense">
          <TableHeader>
            <TableRow className="hover:bg-secondary">
              <TableHead>Nummer</TableHead>
              <TableHead className="w-[100px]">Datum</TableHead>
              <TableHead className="w-[100px]">Gültig bis</TableHead>
              <TableHead className="w-[110px] text-right">Netto</TableHead>
              <TableHead className="w-[110px] text-right">Brutto</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[76px]"></TableHead>
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
                  <TableCell className="font-mono">
                    <span className="flex items-center gap-2">
                      {q.number}
                      {q.emailSentAt && (
                        <Badge
                          variant="secondary"
                          size="sm"
                          className="gap-1"
                          title={`Per E-Mail versendet am ${formatDate(q.emailSentAt)}${q.emailSentTo ? ` an ${q.emailSentTo}` : ""}`}
                        >
                          <Mail className="h-3 w-3" /> Versendet
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>{formatDate(q.date)}</TableCell>
                  <TableCell>{formatDate(q.expiresAt)}</TableCell>
                  <TableCell className="text-right num text-sm text-muted-foreground">
                    {formatCurrency(q.totalNet)}
                  </TableCell>
                  <TableCell className="text-right num text-sm font-medium">
                    {formatCurrency(q.totalGross ?? q.totalNet)}
                  </TableCell>
                  <TableCell>
                    {isSuperseded ? (
                      <Badge variant="secondary" size="sm">
                        Ersetzt
                      </Badge>
                    ) : q.acceptedAt ? (
                      <Badge
                        variant="success" size="sm" className="max-w-none gap-1"
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
                      <Badge variant="outline" size="sm">
                        Offen
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button asChild variant="ghost" size="iconXs" >
                        <a
                          href={`/api/projects/${projectId}/quotes/${q.id}/pdf?download=1`}
                          download
                          rel="noopener"
                          title="PDF herunterladen"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="iconXs"
                        className="text-destructive hover:text-destructive"
                        onClick={() => onDelete(q)}
                        title="Angebot löschen"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
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
