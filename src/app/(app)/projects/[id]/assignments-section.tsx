"use client";

import { Fragment, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Trash2,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Boxes,
  ArrowRight,
  Search,
} from "lucide-react";
import {
  addAssignment,
  removeAssignment,
  updateAssignmentQuantity,
} from "../actions";
import { toast } from "sonner";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type {
  Project,
  ProjectAssignment,
  Device,
  Category,
  Location,
  PackUnit,
  PackUnitDevice,
} from "@prisma/client";

type DeviceLite = Device & { category?: Category | null };
type ItemFull = PackUnitDevice & { device: DeviceLite };
type PackUnitFull = PackUnit & { items: ItemFull[] };
type PackUnitLite = PackUnit & {
  items: (PackUnitDevice & { device: Device })[];
  location: Location | null;
};
type AssignmentWithPackUnit = ProjectAssignment & { packUnit: PackUnitFull };

type OtherProject = {
  projectId: string;
  projectName: string;
  planningStart: Date;
  planningEnd: Date;
  quantity: number;
};
type StockInfo = { totalDemand: number; otherProjects: OtherProject[] };

interface Props {
  project: Project & { assignments: AssignmentWithPackUnit[] };
  allPackUnits: PackUnitLite[];
  conflictMap: Record<string, StockInfo>;
  billingDays: number;
  subtotal: number;
  discount: number;
  total: number;
}

function packUnitRate(items: { device: { dailyRate: { toString(): string } }; quantity: number }[]) {
  return items.reduce((s, it) => s + Number(it.device.dailyRate) * it.quantity, 0);
}

function devicesPerUnit(items: { quantity: number }[]) {
  return items.reduce((s, it) => s + it.quantity, 0);
}

interface ConflictPrompt {
  packUnitId: string;
  packUnitName: string;
  conflicts: { projectName: string; planningStart: Date; planningEnd: Date }[];
}

export function AssignmentsSection({
  project,
  allPackUnits,
  conflictMap,
  billingDays,
  subtotal,
  discount,
  total,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [conflictPrompt, setConflictPrompt] = useState<ConflictPrompt | null>(null);

  const assignedIds = new Set(project.assignments.map((a) => a.packUnitId));
  const availablePackUnits = allPackUnits
    .filter((p) => !assignedIds.has(p.id))
    .filter((p) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
    });

  function toggleExpand(id: string) {
    const s = new Set(expanded);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setExpanded(s);
  }

  function handleAdd(packUnitId: string, force = false) {
    startTransition(async () => {
      try {
        const res = await addAssignment(project.id, { packUnitId, quantity: 1 }, force);
        if (!res.ok && res.conflicts) {
          const pu = allPackUnits.find((p) => p.id === packUnitId);
          setConflictPrompt({
            packUnitId,
            packUnitName: pu ? `${pu.code} — ${pu.name}` : "",
            conflicts: res.conflicts,
          });
          return;
        }
        toast.success("Packeinheit hinzugefügt");
        setConflictPrompt(null);
      } catch (e) {
        toast.error("Fehler", { description: e instanceof Error ? e.message : "" });
      }
    });
  }

  function handleRemove(assignmentId: string) {
    startTransition(async () => {
      try {
        await removeAssignment(project.id, assignmentId);
        toast.success("Packeinheit entfernt");
      } catch (e) {
        toast.error("Fehler", { description: e instanceof Error ? e.message : "" });
      }
    });
  }

  function handleQtyChange(assignmentId: string, qty: number) {
    if (qty < 1) return;
    startTransition(async () => {
      try {
        await updateAssignmentQuantity(project.id, assignmentId, qty);
      } catch (e) {
        toast.error("Fehler", { description: e instanceof Error ? e.message : "" });
      }
    });
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Verfügbares Material</CardTitle>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suchen..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[600px] overflow-y-auto">
              {availablePackUnits.length === 0 && (
                <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                  Keine passenden Packeinheiten
                </p>
              )}
              <ul className="divide-y">
                {availablePackUnits.map((p) => {
                  const rate = packUnitRate(p.items);
                  const total = devicesPerUnit(p.items);
                  return (
                    <li
                      key={p.id}
                      className="group flex items-center gap-2 px-3 py-2 hover:bg-accent/40"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="font-mono text-[10px] px-1">
                            {p.code}
                          </Badge>
                          <span className="truncate text-sm font-medium">{p.name}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>{total} Geräte / Case</span>
                          <span>·</span>
                          <span>{p.stockQuantity ?? 1}× Bestand</span>
                          <span>·</span>
                          <span>{formatCurrency(rate)}/T</span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 opacity-60 group-hover:opacity-100"
                        disabled={pending}
                        onClick={() => handleAdd(p.id)}
                        title="Zum Projekt hinzufügen"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Zugewiesen ({project.assignments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Bezeichnung</TableHead>
                  <TableHead className="text-right">Geräte/Case</TableHead>
                  <TableHead className="text-right">Anzahl</TableHead>
                  <TableHead className="text-right">€ / Tag</TableHead>
                  <TableHead className="text-right">Tage</TableHead>
                  <TableHead className="text-right">Gesamt</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.assignments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      <Boxes className="mx-auto mb-2 h-8 w-8 opacity-30" />
                      Noch keine Packeinheiten zugewiesen
                    </TableCell>
                  </TableRow>
                )}
                {project.assignments.map((a) => {
                  const stockInfo = conflictMap[a.packUnitId];
                  const otherProjects = stockInfo?.otherProjects ?? [];
                  const totalDemand = stockInfo?.totalDemand ?? a.quantity;
                  const stockQty = a.packUnit.stockQuantity ?? 1;
                  const isOverStock = totalDemand > stockQty;
                  const freeAfter = stockQty - totalDemand;
                  const rate = packUnitRate(a.packUnit.items);
                  const devCount = devicesPerUnit(a.packUnit.items);
                  const lineTotal = rate * a.quantity * billingDays;
                  const isExpanded = expanded.has(a.id);

                  return (
                    <Fragment key={a.id}>
                      <TableRow
                        className={cn(
                          isOverStock &&
                            "bg-red-50/70 hover:bg-red-50 dark:bg-red-950/30 dark:hover:bg-red-950/40"
                        )}
                      >
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => toggleExpand(a.id)}
                            disabled={a.packUnit.items.length === 0}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{a.packUnit.code}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 font-medium">
                            <Boxes className="h-4 w-4 text-muted-foreground" />
                            {a.packUnit.name}
                          </div>
                          {otherProjects.length > 0 && (
                            <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-yellow-600">
                              <AlertTriangle className="h-3 w-3" />
                              {otherProjects.map((p) => (
                                <Badge key={p.projectId} variant="warning" className="text-[10px]">
                                  {p.projectName} × {p.quantity} ({formatDate(p.planningStart)})
                                </Badge>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {devCount}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end">
                            <Input
                              type="number"
                              min="1"
                              value={a.quantity}
                              onChange={(e) => handleQtyChange(a.id, Number(e.target.value))}
                              disabled={pending}
                              className="h-8 w-16 text-right tabular-nums"
                            />
                            <span
                              className={cn(
                                "mt-0.5 text-[10px]",
                                isOverStock ? "font-semibold text-destructive" : "text-muted-foreground"
                              )}
                            >
                              {freeAfter} frei / {stockQty} Bestand
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(rate)}</TableCell>
                        <TableCell className="text-right">{billingDays}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatCurrency(lineTotal)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemove(a.id)}
                            disabled={pending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isExpanded && a.packUnit.items.length > 0 && (
                        <TableRow key={a.id + "-items"} className="bg-muted/30">
                          <TableCell colSpan={9} className="p-0">
                            <div className="px-12 py-3">
                              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                                Enthaltene Geräte (pro Case)
                                {a.quantity > 1 && (
                                  <span className="ml-2 font-normal lowercase">
                                    — × {a.quantity} Buchungen = {a.quantity * devCount} Geräte gesamt
                                  </span>
                                )}
                              </div>
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-muted-foreground text-xs">
                                    <th className="text-left py-1">Bezeichnung</th>
                                    <th className="text-left py-1">Kategorie</th>
                                    <th className="text-right py-1">Pro Case</th>
                                    <th className="text-right py-1">Gesamt</th>
                                    <th className="text-right py-1">€ / Tag</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {a.packUnit.items.map((it) => (
                                    <tr key={it.id} className="border-t border-border/50">
                                      <td className="py-1">{it.device.name}</td>
                                      <td className="py-1 text-muted-foreground text-xs">
                                        {it.device.category?.name ?? "—"}
                                      </td>
                                      <td className="py-1 text-right tabular-nums text-xs">
                                        × {it.quantity}
                                      </td>
                                      <td className="py-1 text-right tabular-nums text-xs font-medium">
                                        {it.quantity * a.quantity}
                                      </td>
                                      <td className="py-1 text-right tabular-nums text-xs">
                                        {formatCurrency(
                                          Number(it.device.dailyRate) * it.quantity * a.quantity
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
              {project.assignments.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={7} className="text-right">Zwischensumme</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(subtotal)}</TableCell>
                    <TableCell />
                  </TableRow>
                  {discount > 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-right text-muted-foreground">
                        Rabatt {project.discountPercent.toString()}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        −{formatCurrency(discount)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell colSpan={7} className="text-right font-bold">Gesamt</TableCell>
                    <TableCell className="text-right tabular-nums font-bold">{formatCurrency(total)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!conflictPrompt} onOpenChange={(o) => !o && setConflictPrompt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Packeinheit bereits gebucht
            </DialogTitle>
            <DialogDescription>
              <strong>{conflictPrompt?.packUnitName}</strong> ist im Planungszeitraum dieses
              Projekts bereits anderweitig verplant.
            </DialogDescription>
          </DialogHeader>
          {conflictPrompt && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <ul className="space-y-1">
                {conflictPrompt.conflicts.map((c, i) => (
                  <li key={i}>
                    <strong>{c.projectName}</strong> ({formatDate(c.planningStart)} –{" "}
                    {formatDate(c.planningEnd)})
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConflictPrompt(null)}>Abbrechen</Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => conflictPrompt && handleAdd(conflictPrompt.packUnitId, true)}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Trotzdem hinzufügen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
