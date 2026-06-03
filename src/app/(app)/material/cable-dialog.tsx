"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createCable, updateCable } from "./cables-actions";

export interface CableForDialog {
  id: string;
  name: string;
  cableType: string | null;
  lengthMeters: number | null;
  connectorA: string | null;
  connectorB: string | null;
  stockQuantity: number;
  categoryId: string | null;
  description?: string | null;
  notes?: string | null;
  replacementValue?: number | null;
  weight?: number | null;
  inspectionExempt?: boolean;
}

interface CategoryOpt {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cable: CableForDialog | null;
  categories: CategoryOpt[];
}

export function CableDialog({ open, onOpenChange, cable, categories }: Props) {
  const [name, setName] = useState("");
  const [cableType, setCableType] = useState("");
  const [lengthMeters, setLengthMeters] = useState("");
  const [connectorA, setConnectorA] = useState("");
  const [connectorB, setConnectorB] = useState("");
  const [stockQuantity, setStockQuantity] = useState(1);
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [replacementValue, setReplacementValue] = useState("");
  const [weight, setWeight] = useState("");
  const [inspectionExempt, setInspectionExempt] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setName(cable?.name ?? "");
      setCableType(cable?.cableType ?? "");
      setLengthMeters(cable?.lengthMeters ? String(cable.lengthMeters) : "");
      setConnectorA(cable?.connectorA ?? "");
      setConnectorB(cable?.connectorB ?? "");
      setStockQuantity(cable?.stockQuantity ?? 1);
      setCategoryId(cable?.categoryId ?? "");
      setDescription(cable?.description ?? "");
      setNotes(cable?.notes ?? "");
      setReplacementValue(
        cable?.replacementValue ? String(cable.replacementValue) : ""
      );
      setWeight(cable?.weight ? String(cable.weight) : "");
      setInspectionExempt(cable?.inspectionExempt ?? false);
    }
  }, [open, cable?.id]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Bezeichnung erforderlich");
      return;
    }
    const payload = {
      name: name.trim(),
      description: description || null,
      cableType: cableType || null,
      lengthMeters: lengthMeters ? Number(lengthMeters) : null,
      connectorA: connectorA || null,
      connectorB: connectorB || null,
      stockQuantity: Math.max(1, Math.floor(stockQuantity)),
      replacementValue: replacementValue ? Number(replacementValue) : null,
      weight: weight ? Number(weight) : null,
      inspectionExempt,
      categoryId: categoryId || null,
      notes: notes || null,
    };
    startTransition(async () => {
      try {
        if (cable) {
          await updateCable(cable.id, payload);
          toast.success("Kabel aktualisiert");
        } else {
          await createCable(payload);
          toast.success(
            `Kabel angelegt — ${payload.stockQuantity} Einheit(en) erstellt`
          );
        }
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{cable ? "Kabel bearbeiten" : "Neues Kabel"}</DialogTitle>
          <DialogDescription>
            Beim Anlegen werden automatisch so viele Einzel-Einheiten erstellt wie der Bestand groß ist. Barcodes (DGUV V3) kannst du danach pro Einheit nachpflegen.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="c-name">Bezeichnung</Label>
            <Input
              id="c-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. DMX 5pol 10m"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="c-type">Typ</Label>
              <Input
                id="c-type"
                value={cableType}
                onChange={(e) => setCableType(e.target.value)}
                placeholder="z.B. DMX, Strom, XLR"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-len">Länge (m)</Label>
              <Input
                id="c-len"
                type="number"
                step="0.1"
                min="0"
                value={lengthMeters}
                onChange={(e) => setLengthMeters(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="c-conA">Stecker A</Label>
              <Input
                id="c-conA"
                value={connectorA}
                onChange={(e) => setConnectorA(e.target.value)}
                placeholder="z.B. XLR 5pol male"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-conB">Stecker B</Label>
              <Input
                id="c-conB"
                value={connectorB}
                onChange={(e) => setConnectorB(e.target.value)}
                placeholder="z.B. XLR 5pol female"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="c-stock">Bestand (Stück)</Label>
              <Input
                id="c-stock"
                type="number"
                min="1"
                value={stockQuantity}
                onChange={(e) =>
                  setStockQuantity(Math.max(1, Number(e.target.value) || 1))
                }
              />
              {cable && (
                <p className="text-[11px] text-muted-foreground">
                  Reduzieren entfernt leere Einheiten ohne Barcode/Prüfung.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-cat">Kategorie</Label>
              <Select
                value={categoryId || "none"}
                onValueChange={(v) => setCategoryId(v === "none" ? "" : v)}
              >
                <SelectTrigger id="c-cat">
                  <SelectValue placeholder="Keine" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Keine —</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="c-rv">Wiederbeschaffungswert (€)</Label>
              <Input
                id="c-rv"
                type="number"
                step="0.01"
                min="0"
                value={replacementValue}
                onChange={(e) => setReplacementValue(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-w">Gewicht (kg)</Label>
              <Input
                id="c-w"
                type="number"
                step="0.01"
                min="0"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3">
            <Checkbox
              id="c-exempt"
              checked={inspectionExempt}
              onCheckedChange={(v) => setInspectionExempt(v === true)}
              className="mt-0.5"
            />
            <div className="space-y-1 leading-tight">
              <Label htmlFor="c-exempt" className="cursor-pointer">
                Muss nicht geprüft werden
              </Label>
              <p className="text-xs text-muted-foreground">
                Dieses Kabel ist nicht prüfpflichtig (DGUV V3 entfällt). Im Prüfungsmodus wird es als nicht erforderlich gekennzeichnet.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="c-desc">Beschreibung (optional)</Label>
            <Textarea
              id="c-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="c-notes">Notizen (intern, optional)</Label>
            <Textarea
              id="c-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
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
              {cable ? "Speichern" : "Anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
