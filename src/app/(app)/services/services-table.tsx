"use client";

import { Fragment, useState, useTransition } from "react";
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
import {
  Pencil,
  Trash2,
  Plus,
  X,
  Search,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ServiceItemDialog, ServiceItemVM } from "./service-dialog";
import { deleteServiceItem } from "./actions";
import { toast } from "sonner";
import { billingUnitLabel, serviceItemKindLabel } from "@/lib/labels";
import { formatCurrency } from "@/lib/utils";
import { ServiceItemKind } from "@prisma/client";

type Row = ServiceItemVM & { _count: { projectServices: number } };

// Reihenfolge der Arten in der Anzeige
const KIND_ORDER: ServiceItemKind[] = [
  ServiceItemKind.PERSONAL,
  ServiceItemKind.TRANSPORT,
  ServiceItemKind.SONSTIGES,
];

export function ServicesTable({ items }: { items: Row[] }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceItemVM | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [search, setSearch] = useState("");
  const [collapsedKinds, setCollapsedKinds] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const filtered = items.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.description ?? "").toLowerCase().includes(q)
    );
  });

  // Gruppieren nach kind, Reihenfolge gemäß KIND_ORDER
  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    label: serviceItemKindLabel(kind),
    items: filtered.filter((s) => s.kind === kind),
  })).filter((g) => g.items.length > 0);

  function toggleKind(kind: string) {
    setCollapsedKinds((prev) => {
      const s = new Set(prev);
      if (s.has(kind)) s.delete(kind);
      else s.add(kind);
      return s;
    });
  }

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(item: ServiceItemVM) {
    setEditing(item);
    setDialogOpen(true);
  }

  function onConfirmDelete() {
    if (!deleting) return;
    const id = deleting.id;
    startTransition(async () => {
      try {
        const res = await deleteServiceItem(id);
        if (res.deactivated) {
          toast.info("Position wird in Projekten verwendet — auf inaktiv gesetzt");
        } else {
          toast.success("Position gelöscht");
        }
        setDeleting(null);
      } catch (e) {
        toast.error("Löschen nicht möglich", {
          description: e instanceof Error ? e.message : "",
        });
      }
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suche…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72 pl-8"
          />
        </div>
        {search && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearch("")}
          >
            <X className="h-4 w-4" /> Filter zurücksetzen
          </Button>
        )}
        <div className="ml-auto">
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Position anlegen
          </Button>
        </div>
      </div>

      <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:h-10 [&_th]:px-3">
        <TableHeader>
          <TableRow>
            <TableHead>Bezeichnung</TableHead>
            <TableHead>Einheit</TableHead>
            <TableHead className="text-right">Preis</TableHead>
            <TableHead className="text-right">Verwendung</TableHead>
            <TableHead className="w-[90px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                {items.length === 0
                  ? "Noch keine Positionen angelegt"
                  : "Keine Treffer für die Suche"}
              </TableCell>
            </TableRow>
          )}
          {grouped.map((group) => {
            const isCollapsed = collapsedKinds.has(group.kind);
            return (
              <Fragment key={group.kind}>
                <TableRow
                  className="cursor-pointer bg-muted/30 hover:bg-muted/50"
                  onClick={() => toggleKind(group.kind)}
                >
                  <TableCell colSpan={5} className="py-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
                      {isCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                      )}
                      {isCollapsed ? (
                        <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">{group.label}</span>
                      <span className="ml-1 font-normal text-muted-foreground normal-case">
                        ({group.items.length})
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
                {!isCollapsed &&
                  group.items.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell style={{ paddingLeft: "2.5rem" }}>
                        <div className="font-medium">{s.name}</div>
                        {s.description && (
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {s.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{billingUnitLabel(s.unit)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(s.unitPrice)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {s._count.projectServices}× Projekt(e)
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(s)}
                            title="Bearbeiten"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleting(s)}
                            title="Löschen"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>

      <ServiceItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={editing}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Position löschen?"
        description={
          deleting && (
            <>
              {deleting._count.projectServices > 0 ? (
                <>
                  <strong>{deleting.name}</strong> ist in{" "}
                  {deleting._count.projectServices} Projekt(en) hinterlegt und kann
                  nicht gelöscht werden. Sie wird stattdessen{" "}
                  <strong>auf inaktiv gesetzt</strong>.
                </>
              ) : (
                <>
                  <strong>{deleting.name}</strong> wird unwiderruflich gelöscht.
                </>
              )}
            </>
          )
        }
        confirmLabel={deleting && deleting._count.projectServices > 0 ? "Deaktivieren" : "Löschen"}
        pending={pending}
        onConfirm={onConfirmDelete}
      />
    </>
  );
}
