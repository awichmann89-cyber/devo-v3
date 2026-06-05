"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2, Pencil } from "lucide-react";
import { createDevice, updateDevice } from "./actions";
import { toast } from "sonner";
import {
  type Category,
  type Device,
} from "@prisma/client";
import { Checkbox } from "@/components/ui/checkbox";
import { flattenCategoryTree } from "@/lib/category-tree";

interface Props {
  categories: Category[];
  device?: Device;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  editTrigger?: boolean;
}

export function DeviceDialog({
  categories,
  device,
  open: controlledOpen,
  onOpenChange,
  editTrigger,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const isEdit = !!device;

  const [inspectionExempt, setInspectionExempt] = useState(
    device?.inspectionExempt ?? false
  );
  const [showOnDocuments, setShowOnDocuments] = useState(
    device?.showOnDocuments ?? true
  );
  const [form, setForm] = useState({
    manufacturer: device?.manufacturer ?? "",
    model: device?.model ?? "",
    description: device?.description ?? "",
    stockQuantity: device?.stockQuantity?.toString() ?? "1",
    dailyRate: device?.dailyRate?.toString() ?? "0",
    replacementValue: device?.replacementValue?.toString() ?? "",
    weight: device?.weight?.toString() ?? "",
    powerWatts: device?.powerWatts?.toString() ?? "",
    categoryId: device?.categoryId ?? "",
  });
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      try {
        const name = [form.manufacturer.trim(), form.model.trim()].filter(Boolean).join(" ") || "Gerät";
        const payload = {
          ...form,
          name,
          stockQuantity: Number(form.stockQuantity) || 1,
          dailyRate: Number(form.dailyRate),
          replacementValue: form.replacementValue ? Number(form.replacementValue) : null,
          weight: form.weight ? Number(form.weight) : null,
          powerWatts: form.powerWatts ? Number(form.powerWatts) : null,
          inspectionExempt,
          showOnDocuments,
          categoryId: form.categoryId || null,
        };
        if (isEdit) {
          await updateDevice(device!.id, payload);
          toast.success("Gerät aktualisiert");
        } else {
          await createDevice(payload);
          toast.success("Gerät angelegt");
        }
        setOpen(false);
      } catch (e) {
        toast.error("Fehler", { description: e instanceof Error ? e.message : String(e) });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!device && (
        <DialogTrigger asChild>
          <Button>
            <Plus className="h-4 w-4" /> Neues Gerät
          </Button>
        </DialogTrigger>
      )}
      {device && editTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Pencil className="h-4 w-4" /> Bearbeiten
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Gerät bearbeiten" : "Neues Gerät"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="manu">Hersteller</Label>
              <Input
                id="manu"
                value={form.manufacturer ?? ""}
                onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Modell</Label>
              <Input
                id="model"
                value={form.model ?? ""}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="desc">Beschreibung (extern)</Label>
            <Textarea
              id="desc"
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cat">Kategorie</Label>
            <Select
              value={form.categoryId || "none"}
              onValueChange={(v) => setForm({ ...form, categoryId: v === "none" ? "" : v })}
            >
              <SelectTrigger><SelectValue placeholder="Kategorie" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {flattenCategoryTree(categories).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span style={{ paddingLeft: `${c.depth * 1.25}rem` }}>
                      {c.depth > 0 && <span className="text-muted-foreground mr-1">↳</span>}
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="stock">Lagerbestand</Label>
              <Input
                id="stock"
                type="number"
                min="1"
                step="1"
                value={form.stockQuantity}
                onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rate">€ / Tag (pro Stück)</Label>
              <Input
                id="rate"
                type="number"
                step="0.01"
                value={form.dailyRate}
                onChange={(e) => setForm({ ...form, dailyRate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rep">Wiederbeschaffung €</Label>
              <Input
                id="rep"
                type="number"
                step="0.01"
                value={form.replacementValue ?? ""}
                onChange={(e) => setForm({ ...form, replacementValue: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="weight">Gewicht (kg)</Label>
              <Input
                id="weight"
                type="number"
                step="0.1"
                value={form.weight ?? ""}
                onChange={(e) => setForm({ ...form, weight: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="power">Leistung (W)</Label>
              <Input
                id="power"
                type="number"
                value={form.powerWatts ?? ""}
                onChange={(e) => setForm({ ...form, powerWatts: e.target.value })}
              />
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3">
            <Checkbox
              id="d-exempt"
              checked={inspectionExempt}
              onCheckedChange={(v) => setInspectionExempt(v === true)}
              className="mt-0.5"
            />
            <div className="space-y-1 leading-tight">
              <Label htmlFor="d-exempt" className="cursor-pointer">
                Muss nicht geprüft werden
              </Label>
              <p className="text-xs text-muted-foreground">
                Dieses Gerät ist nicht prüfpflichtig (DGUV V3 entfällt). Im Prüfungsmodus wird es als nicht erforderlich gekennzeichnet.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3">
            <Checkbox
              id="d-show-docs"
              checked={showOnDocuments}
              onCheckedChange={(v) => setShowOnDocuments(v === true)}
              className="mt-0.5"
            />
            <div className="space-y-1 leading-tight">
              <Label htmlFor="d-show-docs" className="cursor-pointer">
                Auf Angeboten & Rechnungen anzeigen
              </Label>
              <p className="text-xs text-muted-foreground">
                Standardmäßig aktiviert. Deaktivieren für Kleinteile wie
                Kabelbinder, Klebeband o.ä., die zwar im Projekt verbucht
                werden, aber nicht auf den Kunden-Dokumenten erscheinen sollen.
                In Berechnung und Packliste bleibt das Gerät enthalten.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Speichern" : "Anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
