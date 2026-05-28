"use client";

import { useMemo, useState, useTransition } from "react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createCategory, updateCategory } from "./actions";
import { flattenCategoryTree } from "@/lib/category-tree";

type CategoryNode = {
  id: string;
  name: string;
  prefix?: string | null;
  parentId: string | null;
};

function suggestPrefix(name: string): string {
  const normalized = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  return normalized.slice(0, 3);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allCategories: CategoryNode[];
} & (
  | { mode: "create"; parent: CategoryNode | null }
  | { mode: "edit"; category: CategoryNode }
);

export function CategoryDialog(props: Props) {
  const { open, onOpenChange, allCategories } = props;
  const isEdit = props.mode === "edit";

  const initial = isEdit
    ? {
        name: props.category.name,
        prefix: props.category.prefix ?? "",
        parentId: props.category.parentId ?? "",
      }
    : { name: "", prefix: "", parentId: props.parent?.id ?? "" };

  const [form, setForm] = useState(initial);
  const [prefixTouched, setPrefixTouched] = useState(isEdit && !!props.category.prefix);
  const [pending, startTransition] = useTransition();

  // Auto-Suggest für Prefix solange der Nutzer ihn nicht selbst angefasst hat
  const suggestedPrefix = !prefixTouched ? suggestPrefix(form.name) : form.prefix;

  // Beim Editieren: eigene Kategorie + alle Nachfahren als Parent ausschließen
  const forbiddenParentIds = useMemo(() => {
    if (!isEdit) return new Set<string>();
    const own = props.category.id;
    const forbidden = new Set<string>([own]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const c of allCategories) {
        if (c.parentId && forbidden.has(c.parentId) && !forbidden.has(c.id)) {
          forbidden.add(c.id);
          changed = true;
        }
      }
    }
    return forbidden;
  }, [isEdit, allCategories, props]);

  const selectableParents = allCategories.filter((c) => !forbiddenParentIds.has(c.id));

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const finalPrefix = (prefixTouched ? form.prefix : suggestedPrefix).toUpperCase().trim();
        const payload = {
          name: form.name.trim(),
          prefix: finalPrefix || null,
          parentId: form.parentId || null,
        };
        if (isEdit) {
          await updateCategory(props.category.id, payload);
          toast.success("Kategorie aktualisiert");
        } else {
          await createCategory(payload);
          toast.success("Kategorie angelegt");
        }
        onOpenChange(false);
      } catch (e) {
        toast.error("Fehler", { description: e instanceof Error ? e.message : "" });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? "Kategorie bearbeiten"
              : props.parent
                ? `Unterkategorie zu "${props.parent.name}"`
                : "Neue Hauptkategorie"}
          </DialogTitle>
          <DialogDescription>
            Kategorien gelten für Geräte und Packeinheiten gleichermaßen.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-[1fr_140px] gap-3">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="z.B. Mikrofone"
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prefix">Kürzel</Label>
              <Input
                id="prefix"
                value={prefixTouched ? form.prefix : suggestedPrefix}
                onChange={(e) => {
                  setPrefixTouched(true);
                  setForm({ ...form, prefix: e.target.value.toUpperCase() });
                }}
                placeholder="MIK"
                maxLength={10}
                className="font-mono uppercase"
                pattern="[A-Z0-9]+"
                title="Nur Großbuchstaben und Zahlen"
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Das Kürzel wird für Inventarnummern von Geräten dieser Kategorie verwendet
            (z.B. {(prefixTouched ? form.prefix : suggestedPrefix) || "MIK"}-001).
          </p>
          <div className="space-y-2">
            <Label htmlFor="parent">Übergeordnete Kategorie</Label>
            <Select
              value={form.parentId || "none"}
              onValueChange={(v) => setForm({ ...form, parentId: v === "none" ? "" : v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Keine (Hauptkategorie) —</SelectItem>
                {flattenCategoryTree(selectableParents).map((c) => (
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
