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
import { Plus, Loader2, Pencil, Boxes } from "lucide-react";
import { createDevice, updateDevice } from "./actions";
import { toast } from "sonner";
import {
  DeviceStatus,
  type Category,
  type Device,
  type Location,
} from "@prisma/client";
import { deviceStatusLabel } from "@/lib/labels";
import { Checkbox } from "@/components/ui/checkbox";
import { flattenCategoryTree } from "@/lib/category-tree";

interface Props {
  categories: Category[];
  locations: Location[];
  device?: Device;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  editTrigger?: boolean;
}



export function DeviceDialog({
  categories,
  locations,
  device,
  open: controlledOpen,
  onOpenChange,
  editTrigger,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const isEdit = !!device;

  const [createSinglePackUnit, setCreateSinglePackUnit] = useState(false);
  const [singlePackUnitLocationId, setSinglePackUnitLocationId] = useState("");
  const [form, setForm] = useState({
    name: device?.name ?? "",
    manufacturer: device?.manufacturer ?? "",
    model: device?.model ?? "",
    description: device?.description ?? "",
    status: device?.status ?? DeviceStatus.AVAILABLE,
    stockQuantity: device?.stockQuantity?.toString() ?? "1",
    dailyRate: device?.dailyRate?.toString() ?? "0",
    replacementValue: device?.replacementValue?.toString() ?? "",
    weight: device?.weight?.toString() ?? "",
    powerWatts: device?.powerWatts?.toString() ?? "",
    categoryId: device?.categoryId ?? "",
    notes: device?.notes ?? "",
  });
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const payload = {
          ...form,
          stockQuantity: Number(form.stockQuantity) || 1,
          dailyRate: Number(form.dailyRate),
          replacementValue: form.replacementValue ? Number(form.replacementValue) : null,
          weight: form.weight ? Number(form.weight) : null,
          powerWatts: form.powerWatts ? Number(form.powerWatts) : null,
          categoryId: form.categoryId || null,
        };
        if (isEdit) {
          await updateDevice(device!.id, payload);
          toast.success("Gerät aktualisiert");
        } else {
          await createDevice(payload, {
            createSingleItemPackUnit: createSinglePackUnit,
            singlePackUnitLocationId: createSinglePackUnit
              ? singlePackUnitLocationId || null
              : null,
          });
          toast.success(
            createSinglePackUnit
              ? "Gerät + Einzelpackeinheit angelegt"
              : "Gerät angelegt"
          );
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
          {!isEdit && (
            <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Seriennummern pro physischem Stück werden auf der Detailseite gepflegt.
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Bezeichnung</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="manu">Hersteller</Label>
              <Input
                id="manu"
                value={form.manufacturer ?? ""}
                onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Modell</Label>
              <Input
                id="model"
                value={form.model ?? ""}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as DeviceStatus })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(DeviceStatus).map((s) => (
                    <SelectItem key={s} value={s}>{deviceStatusLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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

          <div className="space-y-2">
            <Label htmlFor="desc">Beschreibung</Label>
            <Textarea
              id="desc"
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notizen (intern)</Label>
            <Textarea
              id="notes"
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </div>

          {!isEdit && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={createSinglePackUnit}
                  onCheckedChange={(v) => setCreateSinglePackUnit(v === true)}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Boxes className="h-3.5 w-3.5" />
                    Auch als Einzelpackeinheit anlegen
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Erzeugt zusätzlich eine 1:1-Packeinheit (gleicher Name, gleicher
                    Lagerbestand), die nur dieses Gerät enthält. Praktisch für Traversen,
                    Stative oder einzelne Subwoofer, die als Buchungseinheit dienen.
                  </div>
                </div>
              </label>
              {createSinglePackUnit && (
                <div className="space-y-2 ml-6">
                  <Label htmlFor="single-loc">Lagerort der Einzelpackeinheit</Label>
                  <Select
                    value={singlePackUnitLocationId || "none"}
                    onValueChange={(v) =>
                      setSinglePackUnitLocationId(v === "none" ? "" : v)
                    }
                  >
                    <SelectTrigger id="single-loc">
                      <SelectValue placeholder="Lagerort wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Kein Lagerort —</SelectItem>
                      {locations.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

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
