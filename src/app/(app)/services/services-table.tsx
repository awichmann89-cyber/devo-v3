"use client";

import { useState, useTransition } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Plus, X, Search } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ServiceItemDialog, ServiceItemVM } from "./service-dialog";
import { deleteServiceItem, toggleServiceItemActive } from "./actions";
import { toast } from "sonner";
import { billingUnitLabel, serviceItemKindLabel } from "@/lib/labels";
import { formatCurrency } from "@/lib/utils";
import { ServiceItemKind } from "@prisma/client";

type Row = ServiceItemVM & { _count: { projectServices: number } };

export function ServicesTable({ items }: { items: Row[] }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceItemVM | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [pending, startTransition] = useTransition();

  const filtered = items.filter((s) => {
    if (!showInactive && !s.active) return false;
    if (kindFilter !== "all" && s.kind !== kindFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.description ?? "").toLowerCase().includes(q)
    );
  });

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

  function toggleActive(item: ServiceItemVM) {
    startTransition(async () => {
      try {
        await toggleServiceItemActive(item.id, !item.active);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
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
            className="w-64 pl-8"
          />
        </div>
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Arten</SelectItem>
            {Object.values(ServiceItemKind).map((k) => (
              <SelectItem key={k} value={k}>
                {serviceItemKindLabel(k)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={showInactive ? "default" : "outline"}
          size="sm"
          onClick={() => setShowInactive((v) => !v)}
        >
          {showInactive ? "Inaktive ausblenden" : "Inaktive anzeigen"}
        </Button>
        {(search || kindFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setKindFilter("all");
            }}
          >
            <X className="h-4 w-4" /> Filter zurücksetzen
          </Button>
        )}
        <div className="ml-auto">
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Neue Position
          </Button>
        </div>
      </div>

      <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:h-10 [&_th]:px-3">
        <TableHeader>
          <TableRow>
            <TableHead>Bezeichnung</TableHead>
            <TableHead>Art</TableHead>
            <TableHead>Einheit</TableHead>
            <TableHead className="text-right">Preis</TableHead>
            <TableHead className="text-right">Verwendung</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[90px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                {items.length === 0
                  ? "Noch keine Positionen angelegt"
                  : "Keine Treffer für die Suche"}
              </TableCell>
            </TableRow>
          )}
          {filtered.map((s) => (
            <TableRow key={s.id} className={!s.active ? "opacity-60" : ""}>
              <TableCell>
                <div className="font-medium">{s.name}</div>
                {s.description && (
                  <div className="text-xs text-muted-foreground line-clamp-1">
                    {s.description}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-[10px]">
                  {serviceItemKindLabel(s.kind)}
                </Badge>
              </TableCell>
              <TableCell className="text-sm">{billingUnitLabel(s.unit)}</TableCell>
              <TableCell className="text-right font-mono text-sm">
                {formatCurrency(s.unitPrice)}
              </TableCell>
              <TableCell className="text-right text-sm">
                {s._count.projectServices}× Projekt(e)
              </TableCell>
              <TableCell>
                <button
                  type="button"
                  onClick={() => toggleActive(s)}
                  disabled={pending}
                  className="text-xs hover:underline"
                >
                  {s.active ? (
                    <span className="text-emerald-600">Aktiv</span>
                  ) : (
                    <span className="text-muted-foreground">Inaktiv</span>
                  )}
                </button>
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
