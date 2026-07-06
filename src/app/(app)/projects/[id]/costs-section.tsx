"use client";

import { useState, useTransition } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { HandCoins, Plus, Pencil, Trash2, Loader2, Link2, Users, Package } from "lucide-react";
import { toast } from "sonner";
import type { ExtraCostKind } from "@prisma/client";
import { formatCurrency } from "@/lib/utils";
import { extraCostKindLabel } from "@/lib/labels";
import {
  SubhireDialog,
  emptySubhire,
  type SubhireFormValue,
} from "./subhire-dialog";
import {
  removeSubhire,
  addExtraCost,
  updateExtraCost,
  removeExtraCost,
} from "./costs-actions";

export interface SubhireVM {
  id: string;
  deviceId: string | null;
  groupId: string | null;
  name: string;
  supplier: string | null;
  quantity: number;
  unitCost: number;
}

export interface ExtraCostVM {
  id: string;
  label: string;
  kind: ExtraCostKind;
  amount: number;
  notes: string | null;
}

interface Props {
  projectId: string;
  subhires: SubhireVM[];
  extraCosts: ExtraCostVM[];
  devices: { id: string; name: string; manufacturer: string | null; model: string | null }[];
  groups: { id: string; name: string }[];
}

type ExtraDialogState = {
  id?: string;
  label: string;
  kind: ExtraCostKind;
  amount: number;
  notes: string;
} | null;

export function CostsSection({
  projectId,
  subhires,
  extraCosts,
  devices,
  groups,
}: Props) {
  const [pending, startTransition] = useTransition();

  // ----- Zumietungen -----
  const [subhireDialog, setSubhireDialog] = useState<SubhireFormValue | null>(null);
  const [subhireDelete, setSubhireDelete] = useState<SubhireVM | null>(null);
  const deviceNameById = new Map(devices.map((d) => [d.id, d.name]));

  const subhireTotal = subhires.reduce(
    (s, x) => s + x.unitCost * x.quantity,
    0
  );

  // ----- Extrakosten -----
  const [extraDialog, setExtraDialog] = useState<ExtraDialogState>(null);
  const [extraDelete, setExtraDelete] = useState<ExtraCostVM | null>(null);

  const extraPersonal = extraCosts
    .filter((c) => c.kind === "PERSONAL")
    .reduce((s, c) => s + c.amount, 0);
  const extraOther = extraCosts
    .filter((c) => c.kind === "SONSTIGES")
    .reduce((s, c) => s + c.amount, 0);
  const extraTotal = extraPersonal + extraOther;

  function handleSaveExtra() {
    if (!extraDialog) return;
    const label = extraDialog.label.trim();
    if (!label) {
      toast.error("Bezeichnung darf nicht leer sein");
      return;
    }
    const payload = {
      label,
      kind: extraDialog.kind,
      amount: extraDialog.amount,
      notes: extraDialog.notes.trim() || null,
    };
    startTransition(async () => {
      try {
        if (extraDialog.id) {
          await updateExtraCost(extraDialog.id, payload);
          toast.success("Extrakosten gespeichert");
        } else {
          await addExtraCost(projectId, payload);
          toast.success("Extrakosten hinzugefügt");
        }
        setExtraDialog(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleDeleteSubhire() {
    if (!subhireDelete) return;
    const id = subhireDelete.id;
    startTransition(async () => {
      try {
        await removeSubhire(id);
        toast.success("Zumietung entfernt");
        setSubhireDelete(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleDeleteExtra() {
    if (!extraDelete) return;
    const id = extraDelete.id;
    startTransition(async () => {
      try {
        await removeExtraCost(id);
        toast.success("Extrakosten entfernt");
        setExtraDelete(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* -------------------- Zumietungen -------------------- */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <HandCoins className="h-5 w-5" /> Zugemietetes Material
            </CardTitle>
            <CardDescription>
              Fehlendes Material extern zumieten. Rein interne Kosten — erscheint
              nicht auf Angeboten/Rechnungen und ändert die Planung nicht.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => setSubhireDialog(emptySubhire())}
          >
            <Plus className="h-4 w-4" /> Zumietung hinzufügen
          </Button>
        </CardHeader>
        <CardContent>
          {subhires.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Noch keine Zumietungen erfasst.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bezeichnung</TableHead>
                  <TableHead>Vermieter</TableHead>
                  <TableHead className="text-right w-[80px]">Anzahl</TableHead>
                  <TableHead className="text-right w-[110px]">€ / Stück</TableHead>
                  <TableHead className="text-right w-[120px]">Summe</TableHead>
                  <TableHead className="w-[90px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subhires.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-medium">{s.name}</div>
                      {s.deviceId && (
                        <div className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400">
                          <Link2 className="h-3 w-3" />
                          verknüpft
                          {deviceNameById.get(s.deviceId) &&
                            deviceNameById.get(s.deviceId) !== s.name && (
                              <span className="text-muted-foreground">
                                ({deviceNameById.get(s.deviceId)})
                              </span>
                            )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.supplier || "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono">
                      {s.quantity}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono">
                      {formatCurrency(s.unitCost)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono font-medium">
                      {formatCurrency(s.unitCost * s.quantity)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Bearbeiten"
                          onClick={() =>
                            setSubhireDialog({
                              id: s.id,
                              deviceId: s.deviceId,
                              groupId: s.groupId,
                              name: s.name,
                              supplier: s.supplier ?? "",
                              quantity: s.quantity,
                              unitCost: s.unitCost,
                              notes: "",
                            })
                          }
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          title="Entfernen"
                          onClick={() => setSubhireDelete(s)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2">
                  <TableCell colSpan={4} className="font-semibold">
                    Zumietkosten gesamt
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono font-semibold">
                    {formatCurrency(subhireTotal)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* -------------------- Extrakosten -------------------- */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Extrakosten
            </CardTitle>
            <CardDescription>
              Sonstige und personaltechnische Zusatzkosten. Ebenfalls rein intern.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() =>
              setExtraDialog({ label: "", kind: "SONSTIGES", amount: 0, notes: "" })
            }
          >
            <Plus className="h-4 w-4" /> Extrakosten hinzufügen
          </Button>
        </CardHeader>
        <CardContent>
          {extraCosts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Noch keine Extrakosten erfasst.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bezeichnung</TableHead>
                  <TableHead className="w-[130px]">Kategorie</TableHead>
                  <TableHead className="text-right w-[130px]">Betrag</TableHead>
                  <TableHead className="w-[90px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {extraCosts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.label}</div>
                      {c.notes && (
                        <div className="text-xs text-muted-foreground">{c.notes}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={c.kind === "PERSONAL" ? "default" : "secondary"}
                        className="gap-1"
                      >
                        {c.kind === "PERSONAL" ? (
                          <Users className="h-3 w-3" />
                        ) : (
                          <Package className="h-3 w-3" />
                        )}
                        {extraCostKindLabel(c.kind)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono">
                      {formatCurrency(c.amount)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Bearbeiten"
                          onClick={() =>
                            setExtraDialog({
                              id: c.id,
                              label: c.label,
                              kind: c.kind,
                              amount: c.amount,
                              notes: c.notes ?? "",
                            })
                          }
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          title="Entfernen"
                          onClick={() => setExtraDelete(c)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={2} className="text-muted-foreground">
                    davon Personal
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono text-muted-foreground">
                    {formatCurrency(extraPersonal)}
                  </TableCell>
                  <TableCell />
                </TableRow>
                <TableRow>
                  <TableCell colSpan={2} className="text-muted-foreground">
                    davon Sonstiges
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono text-muted-foreground">
                    {formatCurrency(extraOther)}
                  </TableCell>
                  <TableCell />
                </TableRow>
                <TableRow className="border-t-2">
                  <TableCell colSpan={2} className="font-semibold">
                    Extrakosten gesamt
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono font-semibold">
                    {formatCurrency(extraTotal)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* -------------------- Dialoge -------------------- */}
      <SubhireDialog
        projectId={projectId}
        value={subhireDialog}
        onClose={() => setSubhireDialog(null)}
        devices={devices}
        groups={groups}
      />

      <Dialog open={extraDialog !== null} onOpenChange={(o) => !o && setExtraDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {extraDialog?.id ? "Extrakosten bearbeiten" : "Extrakosten hinzufügen"}
            </DialogTitle>
            <DialogDescription>
              Interne Zusatzkosten — erscheinen nicht auf Kundendokumenten.
            </DialogDescription>
          </DialogHeader>
          {extraDialog && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="extra-label">Bezeichnung</Label>
                <Input
                  id="extra-label"
                  value={extraDialog.label}
                  onChange={(e) =>
                    setExtraDialog({ ...extraDialog, label: e.target.value })
                  }
                  placeholder="z.B. Aushilfe Aufbau"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Kategorie</Label>
                  <Select
                    value={extraDialog.kind}
                    onValueChange={(v) =>
                      setExtraDialog({ ...extraDialog, kind: v as ExtraCostKind })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERSONAL">Personal</SelectItem>
                      <SelectItem value="SONSTIGES">Sonstiges</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="extra-amount">Betrag (netto)</Label>
                  <Input
                    id="extra-amount"
                    type="number"
                    min={0}
                    step="0.01"
                    value={extraDialog.amount}
                    onChange={(e) =>
                      setExtraDialog({
                        ...extraDialog,
                        amount: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="tabular-nums"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="extra-notes">Notiz (optional)</Label>
                <Textarea
                  id="extra-notes"
                  value={extraDialog.notes}
                  onChange={(e) =>
                    setExtraDialog({ ...extraDialog, notes: e.target.value })
                  }
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtraDialog(null)} disabled={pending}>
              Abbrechen
            </Button>
            <Button onClick={handleSaveExtra} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {extraDialog?.id ? "Speichern" : "Hinzufügen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={subhireDelete !== null}
        onOpenChange={(o) => !o && setSubhireDelete(null)}
        title="Zumietung entfernen?"
        description={`„${subhireDelete?.name}" wird dauerhaft entfernt.`}
        confirmLabel="Entfernen"
        pending={pending}
        onConfirm={handleDeleteSubhire}
      />
      <ConfirmDialog
        open={extraDelete !== null}
        onOpenChange={(o) => !o && setExtraDelete(null)}
        title="Extrakosten entfernen?"
        description={`„${extraDelete?.label}" wird dauerhaft entfernt.`}
        confirmLabel="Entfernen"
        pending={pending}
        onConfirm={handleDeleteExtra}
      />
    </div>
  );
}
