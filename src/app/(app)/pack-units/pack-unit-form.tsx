"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import { Loader2 } from "lucide-react";
import { createPackUnit, updatePackUnit } from "./actions";
import { toast } from "sonner";
import type { Category, Location, PackUnit } from "@prisma/client";
import { flattenCategoryTree } from "@/lib/category-tree";

interface Props {
  packUnit?: PackUnit;
  locations: Location[];
  categories: Category[];
  /** Wenn übergeben (z.B. im Dialog), wird das statt router.back() aufgerufen */
  onCancel?: () => void;
}

export function PackUnitForm({ packUnit, locations, categories, onCancel }: Props) {
  const router = useRouter();
  const isEdit = !!packUnit;
  const [form, setForm] = useState({
    code: packUnit?.code ?? "",
    name: packUnit?.name ?? "",
    description: packUnit?.description ?? "",
    weight: packUnit?.weight?.toString() ?? "",
    stockQuantity: packUnit?.stockQuantity?.toString() ?? "1",
    packMode: (packUnit?.packMode ?? "FIXED") as "FIXED" | "VARIABLE",
    categoryId: packUnit?.categoryId ?? "",
    locationId: packUnit?.locationId ?? "",
  });
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        // Bei Create: code weglassen → wird serverseitig generiert
        const payload = {
          ...form,
          code: isEdit ? form.code : undefined,
          weight: form.weight ? Number(form.weight) : null,
          stockQuantity: Number(form.stockQuantity) || 1,
          categoryId: form.categoryId || null,
          locationId: form.locationId || null,
        };
        if (packUnit) {
          await updatePackUnit(packUnit.id, payload);
          toast.success("Packeinheit aktualisiert");
          router.refresh();
        } else {
          // redirect erfolgt in der Action
          await createPackUnit(payload);
        }
      } catch (e) {
        if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
        toast.error("Fehler", { description: e instanceof Error ? e.message : String(e) });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
          autoFocus
        />
      </div>

      {isEdit ? (
        <div className="grid grid-cols-2 gap-4">
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
            <p className="text-[11px] text-muted-foreground">
              Anzahl identischer Packeinheiten. Geräte = Inhalt einer Einheit.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="weight">Gewicht (kg)</Label>
            <Input
              id="weight"
              type="number"
              step="0.1"
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: e.target.value })}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
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
            <p className="text-[11px] text-muted-foreground">
              Anzahl identischer Packeinheiten. Geräte = Inhalt einer Einheit.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="weight">Gewicht (kg)</Label>
            <Input
              id="weight"
              type="number"
              step="0.1"
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: e.target.value })}
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="packMode">Pack-Modus</Label>
        <Select
          value={form.packMode}
          onValueChange={(v) => setForm({ ...form, packMode: v as "FIXED" | "VARIABLE" })}
        >
          <SelectTrigger id="packMode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="FIXED">Fix — Case wird immer komplett mitgenommen</SelectItem>
            <SelectItem value="VARIABLE">Variabel — Inhalt kann einzeln entnommen werden</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          Bei <strong>Fix</strong> wird die ganze Packeinheit auf die Packliste gesetzt — auch wenn weniger Geräte gebraucht werden (z.B. Doppelcase Lautsprecher). Bei <strong>Variabel</strong> kann der Inhalt teilweise mitgenommen werden (z.B. 6er-Set Bühnenpodest, davon nur 4 mit).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="category">Kategorie</Label>
          <Select
            value={form.categoryId || "none"}
            onValueChange={(v) => setForm({ ...form, categoryId: v === "none" ? "" : v })}
          >
            <SelectTrigger><SelectValue placeholder="Kategorie wählen" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Keine —</SelectItem>
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
        <div className="space-y-2">
          <Label htmlFor="location">Lagerort</Label>
          <Select
            value={form.locationId || "none"}
            onValueChange={(v) => setForm({ ...form, locationId: v === "none" ? "" : v })}
          >
            <SelectTrigger>
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
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Beschreibung</Label>
        <Textarea
          id="description"
          value={form.description ?? ""}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => (onCancel ? onCancel() : router.back())}
        >
          Abbrechen
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {packUnit ? "Speichern" : "Anlegen"}
        </Button>
      </div>
    </form>
  );
}