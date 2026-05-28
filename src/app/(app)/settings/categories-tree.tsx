"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  Folder,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteCategory } from "./actions";
import { toast } from "sonner";
import { CategoryDialog } from "./category-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type CategoryNode = {
  id: string;
  name: string;
  prefix: string | null;
  parentId: string | null;
  _count: { devices: number; packUnits: number; children: number };
};

interface Props {
  categories: CategoryNode[];
}

export function CategoriesTree({ categories }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Default: alle Top-Level mit Kindern aufklappen
    const s = new Set<string>();
    for (const c of categories) {
      if (!c.parentId && c._count.children > 0) s.add(c.id);
    }
    return s;
  });
  const [dialogState, setDialogState] = useState<
    | { mode: "create"; parent: CategoryNode | null }
    | { mode: "edit"; category: CategoryNode }
    | null
  >(null);
  const [deleting, setDeleting] = useState<CategoryNode | null>(null);
  const [pending, startTransition] = useTransition();

  // Index: parentId -> children
  const childrenOf = useMemo(() => {
    const m = new Map<string | null, CategoryNode[]>();
    for (const c of categories) {
      const list = m.get(c.parentId) ?? [];
      list.push(c);
      m.set(c.parentId, list);
    }
    return m;
  }, [categories]);

  const roots = childrenOf.get(null) ?? [];

  function toggle(id: string) {
    const s = new Set(expanded);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setExpanded(s);
  }

  function confirmDelete() {
    if (!deleting) return;
    startTransition(async () => {
      try {
        await deleteCategory(deleting.id);
        toast.success("Kategorie gelöscht");
        setDeleting(null);
      } catch (e) {
        toast.error("Löschen nicht möglich", {
          description: e instanceof Error ? e.message : "",
        });
      }
    });
  }

  function renderNode(c: CategoryNode, depth: number) {
    const isOpen = expanded.has(c.id);
    const kids = childrenOf.get(c.id) ?? [];
    const hasChildren = kids.length > 0;
    return (
      <div key={c.id}>
        <div
          className="group flex items-center gap-2 rounded-md px-2 py-2 hover:bg-accent/40"
          style={{ paddingLeft: `${depth * 24 + 8}px` }}
        >
          <button
            type="button"
            onClick={() => hasChildren && toggle(c.id)}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent"
            disabled={!hasChildren}
          >
            {hasChildren ? (
              isOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )
            ) : (
              <span className="block h-1 w-1 rounded-full bg-muted-foreground/30" />
            )}
          </button>

          <div className="shrink-0 text-muted-foreground">
            {isOpen && hasChildren ? (
              <FolderOpen className="h-4 w-4" />
            ) : (
              <Folder className="h-4 w-4" />
            )}
          </div>

          <span className="font-medium">{c.name}</span>

          {c.prefix && (
            <Badge variant="secondary" className="font-mono text-[10px]">
              {c.prefix}-
            </Badge>
          )}

          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {c._count.devices > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {c._count.devices} Geräte
              </Badge>
            )}
            {c._count.packUnits > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {c._count.packUnits} Packeinheiten
              </Badge>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Unterkategorie hinzufügen"
              onClick={() => setDialogState({ mode: "create", parent: c })}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Bearbeiten"
              onClick={() => setDialogState({ mode: "edit", category: c })}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Löschen"
              disabled={pending}
              onClick={() => setDeleting(c)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {isOpen && hasChildren && (
          <div className={cn("border-l border-border/50 ml-4")}>
            {kids.map((k) => renderNode(k, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {categories.length} Kategorien insgesamt
        </p>
        <Button onClick={() => setDialogState({ mode: "create", parent: null })}>
          <Plus className="h-4 w-4" /> Neue Hauptkategorie
        </Button>
      </div>

      {roots.length === 0 ? (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          Noch keine Kategorien angelegt
        </div>
      ) : (
        <div className="rounded-md border">{roots.map((r) => renderNode(r, 0))}</div>
      )}

      {dialogState && (
        <CategoryDialog
          open
          onOpenChange={(o) => !o && setDialogState(null)}
          allCategories={categories}
          {...(dialogState.mode === "create"
            ? { mode: "create", parent: dialogState.parent }
            : { mode: "edit", category: dialogState.category })}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Kategorie löschen?"
        description={
          deleting && (
            <>
              <strong>{deleting.name}</strong> wird unwiderruflich gelöscht. Kategorien
              mit zugeordneten Geräten, Packeinheiten oder Unterkategorien können nicht
              gelöscht werden.
            </>
          )
        }
        confirmLabel="Löschen"
        pending={pending}
        onConfirm={confirmDelete}
      />
    </>
  );
}
