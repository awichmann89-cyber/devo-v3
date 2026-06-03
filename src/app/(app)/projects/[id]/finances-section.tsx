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
import { Label } from "@/components/ui/label";
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
}

function invoiceGross(inv: FinancesInvoiceVM): number {
  return inv.totalGross ?? inv.totalNet;
}

export interface FinancesInvoiceVM {
  id: string;
  number: string;
  date: string;
  dueDate: string;
  totalNet: number;
  totalGross: number | null;
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
    const items = groups.filter((g) => g.kind === kind);
    const subtotal = items.reduce((s, g) => s + groupNet(g).net, 0);
    const discountPercent = safePct(
      kind === "MATERIAL" ? materialDiscountPercent : servicesDiscountPercent
    );
    const discount = (subtotal * discountPercent) / 100;
    const net = subtotal - discount;
    return { items, subtotal, discountPercent, discount, net };
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
          <TableCell className="text-right tabular-nums text-muted-foreground">
            {data.discount > 0 ? "−" + formatCurrency(data.discount) : "—"}
          </TableCell>
          <TableCell className="text-right tabular-nums font-mono font-semibold">
            {formatCurrency(data.net)}
          </TableCell>
        </TableRow>
        {isExpanded &&
          data.items.map((g) => {
            const { discount, net } = groupNet(g);
            return (
              <TableRow key={g.id} className="border-l-2 border-l-transparent">
                <TableCell className="pl-10 text-sm">{g.name}</TableCell>
                <TableCell className="text-right tabular-nums font-mono text-sm">
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
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground text-sm">
                  {discount > 0 ? "−" + formatCurrency(discount) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums font-mono text-sm">
                  {formatCurrency(net)}
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
      />

      <QuoteDialog
        open={quoteDialog}
        onOpenChange={setQuoteDialog}
        projectId={projectId}
        projectName={projectName}
        defaultTotal={grandTotal}
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
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  projectName: string;
  defaultTotal: number;
}) {
  const [pending, startTransition] = useTransition();

  function defaultDueDate(): string {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  }
  const [dueDate, setDueDate] = useState<string>(defaultDueDate);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dueDate) {
      toast.error("Fälligkeitsdatum erforderlich");
      return;
    }
    startTransition(async () => {
      try {
        const inv = await createInvoice(
          projectId,
          new Date(dueDate),
          defaultTotal
        );
        toast.success(`Rechnung ${inv.number} angelegt`);
        window.open(
          `/api/projects/${projectId}/invoices/${inv.id}/pdf`,
          "_blank"
        );
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
          <DialogTitle>Rechnung erstellen</DialogTitle>
          <DialogDescription>
            Für Projekt <strong>{projectName}</strong>. Es wird automatisch eine
            fortlaufende Rechnungsnummer vergeben.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dueDate">Zahlungsfrist</Label>
            <Input
              id="dueDate"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Wird auf der Rechnung als „zahlbar bis …" ausgewiesen.
            </p>
          </div>
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Rechnungsbetrag</span>
              <span className="font-mono font-medium tabular-nums">
                {new Intl.NumberFormat("de-DE", {
                  style: "currency",
                  currency: "EUR",
                }).format(defaultTotal)}
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
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Rechnung erstellen
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
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  projectName: string;
  defaultTotal: number;
}) {
  const [pending, startTransition] = useTransition();

  function defaultExpiresAt(): string {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  }
  const [expiresAt, setExpiresAt] = useState<string>(defaultExpiresAt);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!expiresAt) {
      toast.error("Ablaufdatum erforderlich");
      return;
    }
    startTransition(async () => {
      try {
        const q = await createQuote(
          projectId,
          new Date(expiresAt),
          defaultTotal
        );
        toast.success(`Angebot ${q.number} angelegt`);
        window.open(
          `/api/projects/${projectId}/quotes/${q.id}/pdf`,
          "_blank"
        );
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
          <DialogTitle>Angebot erstellen</DialogTitle>
          <DialogDescription>
            Für Projekt <strong>{projectName}</strong>. Es wird automatisch eine
            fortlaufende Angebotsnummer vergeben.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="expiresAt">Gültig bis</Label>
            <Input
              id="expiresAt"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Wird auf dem Angebot als „gültig bis …" ausgewiesen.
            </p>
          </div>
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Angebotsbetrag</span>
              <span className="font-mono font-medium tabular-nums">
                {new Intl.NumberFormat("de-DE", {
                  style: "currency",
                  currency: "EUR",
                }).format(defaultTotal)}
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
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Angebot erstellen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
