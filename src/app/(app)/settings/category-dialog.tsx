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
  parentId: string | null;
};

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
        parentId: props.category.parentId ?? "",
      }
    : { name: "", parentId: props.parent?.id ?? "" };

  const [form, setForm] = useState(initial);
  const [pending, startTransition] = useTransition();

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
    e.stopPropagation();
    startTransition(async () => {
      try {
        const payload = {
          name: form.name.trim(),
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
