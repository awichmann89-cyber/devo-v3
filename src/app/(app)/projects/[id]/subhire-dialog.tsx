"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { addSubhire, updateSubhire } from "./costs-actions";

/** Editierbarer Zustand einer Zumietung im Dialog. `id` gesetzt → Bearbeiten. */
export interface SubhireFormValue {
  id?: string;
  deviceId: string | null;
  adHocItemId: string | null;
  groupId: string | null;
  /**
   * Gruppe auf der Kosten-Seite (kind SUBHIRE). undefined = nicht ändern
   * (z.B. Bearbeitung aus dem Material-Tab); null = Default-Gruppe.
   */
  costGroupId?: string | null;
  name: string;
  supplier: string;
  quantity: number;
  unitCost: number;
  notes: string;
}

export function emptySubhire(
  overrides: Partial<SubhireFormValue> = {}
): SubhireFormValue {
  return {
    deviceId: null,
    adHocItemId: null,
    groupId: null,
    costGroupId: null,
    name: "",
    supplier: "",
    quantity: 1,
    unitCost: 0,
    notes: "",
    ...overrides,
  };
}

interface Props {
  projectId: string;
  /** null = geschlossen; ein Wert öffnet den Dialog (seed für das Formular). */
  value: SubhireFormValue | null;
  onClose: () => void;
  /** Katalog-Geräte für die optionale Verknüpfung. */
  devices: { id: string; name: string; manufacturer?: string | null; model?: string | null }[];
  /** Ad-hoc-Positionen („Vorübergehende Geräte") des Projekts für die Verknüpfung. */
  adHocItems: { id: string; name: string }[];
  /** Material-Gruppen für die optionale Platzierung freier Zumietungen. */
  groups: { id: string; name: string }[];
}

const NO_GROUP = "__none__";

/**
 * Gemeinsamer Dialog zum Anlegen/Bearbeiten einer Zumietung. Wird vom Material-
 * Tab (vorbelegt mit Gerät + Fehlmenge) und vom Kosten-Tab genutzt.
 */
export function SubhireDialog({ projectId, value, onClose, devices, adHocItems, groups }: Props) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<SubhireFormValue>(emptySubhire());

  useEffect(() => {
    if (value) setForm(value);
  }, [value]);

  const open = value !== null;

  // Verknüpfungsziele: Katalog-Geräte (Präfix „d:") + Ad-hoc-Positionen („a:").
  const linkOptions: ComboboxOption[] = [
    ...devices.map((d) => ({
      value: `d:${d.id}`,
      label: d.name,
      hint: [d.manufacturer, d.model].filter(Boolean).join(" ") || undefined,
    })),
    ...adHocItems.map((a) => ({
      value: `a:${a.id}`,
      label: a.name,
      hint: "Vorübergehendes Gerät",
    })),
  ];
  const currentLinkValue = form.deviceId
    ? `d:${form.deviceId}`
    : form.adHocItemId
      ? `a:${form.adHocItemId}`
      : "";

  function set<K extends keyof SubhireFormValue>(key: K, v: SubhireFormValue[K]) {
    setForm((f) => ({ ...f, [key]: v }));
  }

  function handleLinkChange(value: string) {
    if (!value) {
      setForm((f) => ({ ...f, deviceId: null, adHocItemId: null }));
      return;
    }
    const kind = value.slice(0, 1);
    const id = value.slice(2);
    const label =
      kind === "d"
        ? devices.find((d) => d.id === id)?.name
        : adHocItems.find((a) => a.id === id)?.name;
    setForm((f) => ({
      ...f,
      deviceId: kind === "d" ? id : null,
      adHocItemId: kind === "a" ? id : null,
      // Namen automatisch übernehmen, wenn noch leer.
      name: f.name.trim() ? f.name : label ?? f.name,
    }));
  }

  function handleSave() {
    const name = form.name.trim();
    if (!name) {
      toast.error("Bezeichnung darf nicht leer sein");
      return;
    }
    startTransition(async () => {
      try {
        const payload = {
          name,
          deviceId: form.deviceId,
          adHocItemId: form.adHocItemId,
          groupId: form.groupId,
          costGroupId: form.costGroupId,
          supplier: form.supplier.trim() || null,
          quantity: form.quantity,
          unitCost: form.unitCost,
          notes: form.notes.trim() || null,
        };
        if (form.id) {
          await updateSubhire(form.id, payload);
          toast.success("Zumietung gespeichert");
        } else {
          await addSubhire(projectId, payload);
          toast.success("Zumietung hinzugefügt");
        }
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  const lineTotal = (Number(form.unitCost) || 0) * (Number(form.quantity) || 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {form.id ? "Zumietung bearbeiten" : "Material zumieten"}
          </DialogTitle>
          <DialogDescription>
            Interne Kostenposition — erscheint nicht auf Angeboten, Rechnungen
            oder Packlisten und ändert die Planung nicht.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Verknüpfung (optional)</Label>
            <Combobox
              value={currentLinkValue}
              onValueChange={handleLinkChange}
              options={linkOptions}
              placeholder="Gerät oder Vorübergehendes Gerät suchen…"
              emptyLabel="— keine Verknüpfung (freie Position) —"
              clearable
            />
            <p className="text-[11px] text-muted-foreground">
              Verknüpft mit einem Gerät oder einem Vorübergehenden Gerät: dessen
              Zeile wird auf der Materialseite magenta markiert. Ohne Verknüpfung
              erscheint die Zumietung als eigene Zeile in der gewählten Gruppe.
            </p>
          </div>

          {!form.deviceId && !form.adHocItemId && groups.length > 0 && (
            <div className="space-y-1.5">
              <Label>Material-Gruppe (optional)</Label>
              <Select
                value={form.groupId ?? NO_GROUP}
                onValueChange={(v) => set("groupId", v === NO_GROUP ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Gruppe wählen…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_GROUP}>— keine Gruppe —</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="subhire-name">Bezeichnung</Label>
            <Input
              id="subhire-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="z.B. Moving Head XY"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="subhire-supplier">Vermieter (optional)</Label>
            <Input
              id="subhire-supplier"
              value={form.supplier}
              onChange={(e) => set("supplier", e.target.value)}
              placeholder="Von wem zugemietet?"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="subhire-qty">Anzahl</Label>
              <Input
                id="subhire-qty"
                type="number"
                min={1}
                step={1}
                value={form.quantity}
                onChange={(e) => set("quantity", Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subhire-cost">Kosten / Stück (netto)</Label>
              <Input
                id="subhire-cost"
                type="number"
                min={0}
                step="0.01"
                value={form.unitCost}
                onChange={(e) => set("unitCost", Math.max(0, Number(e.target.value) || 0))}
                className="tabular-nums"
              />
            </div>
          </div>

          <div className="flex justify-between border-t pt-2 text-sm">
            <span className="text-muted-foreground">Zumietkosten gesamt</span>
            <span className="font-mono font-medium tabular-nums">
              {formatCurrency(lineTotal)}
            </span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="subhire-notes">Notiz (optional)</Label>
            <Textarea
              id="subhire-notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {form.id ? "Speichern" : "Hinzufügen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
