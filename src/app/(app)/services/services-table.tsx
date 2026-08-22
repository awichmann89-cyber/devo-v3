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
import { TableEmpty } from "@/components/ui/table-empty";
import { TableGroupRow, groupChildIndent } from "@/components/ui/table-group-row";
import { RowAction, RowActions } from "@/components/ui/row-actions";
import { ListCard } from "@/components/layout/list-card";
import { FilterResetButton, FilterSearch } from "@/components/filters/filter-controls";
import { Button } from "@/components/ui/button";
import { Caravan, Pencil, Trash2, Plus } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ServiceItemDialog, ServiceItemVM } from "./service-dialog";
import type { VehicleOptionVM } from "../vehicles/vehicle-dialog";
import { deleteServiceItem } from "./actions";
import { toast } from "sonner";
import { toastBlocked } from "@/lib/toast";
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

export function ServicesTable({
  items,
  vehicles,
}: {
  items: Row[];
  vehicles: VehicleOptionVM[];
}) {
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
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
      s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q)
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
        toastBlocked(e, "Löschen");
      }
    });
  }

  return (
    <>
      <ListCard
        title="Positionen"
        info="Positionen mit Preis und Einheit (Stunde, Tag, Pauschale, Stück). Sie können im Projekt mehrfach mit eigener Menge und optionalem Preis-Override gebucht werden."
        action={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Position anlegen
          </Button>
        }
        count={{ shown: filtered.length, total: items.length }}
        filters={
          <>
            <FilterSearch
              value={search}
              onChange={setSearch}
              placeholder="Bezeichnung oder Beschreibung…"
            />
            {search && <FilterResetButton onClick={() => setSearch("")} />}
          </>
        }
      >
        <Table density="comfortable">
          <TableHeader>
            <TableRow>
              <TableHead>Bezeichnung</TableHead>
              <TableHead>Einheit</TableHead>
              <TableHead className="text-right">Preis</TableHead>
              <TableHead className="text-right">Verwendung</TableHead>
              <TableHead className="w-[76px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableEmpty colSpan={5} hasData={items.length > 0} entity="Positionen" />
            )}
            {grouped.map((group) => {
              const isCollapsed = collapsedKinds.has(group.kind);
              return (
                <Fragment key={group.kind}>
                  <TableGroupRow
                    colSpan={5}
                    label={group.label}
                    count={group.items.length}
                    collapsed={isCollapsed}
                    onToggle={() => toggleKind(group.kind)}
                  />
                  {!isCollapsed &&
                    group.items.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell style={{ paddingLeft: groupChildIndent(0) }}>
                          <div className="font-medium">{s.name}</div>
                          {s.defaultVehicleId && (
                            <div
                              className="flex items-center gap-1 text-xs text-muted-foreground"
                              title="Wird beim Buchen dieser Position automatisch eingeplant"
                            >
                              <Caravan className="h-3 w-3 shrink-0" />
                              {vehicleById.get(s.defaultVehicleId)?.name ??
                                "Einheit inaktiv oder gelöscht"}
                            </div>
                          )}
                          {s.description && (
                            <div className="line-clamp-1 text-xs text-muted-foreground">
                              {s.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{billingUnitLabel(s.unit)}</TableCell>
                        <TableCell className="num text-right">
                          {formatCurrency(s.unitPrice)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {s._count.projectServices}× Projekt(e)
                        </TableCell>
                        <TableCell>
                          <RowActions density="comfortable">
                            <RowAction
                              icon={Pencil}
                              label="Bearbeiten"
                              onClick={() => openEdit(s)}
                            />
                            <RowAction
                              icon={Trash2}
                              label="Löschen"
                              destructive
                              disabled={pending}
                              onClick={() => setDeleting(s)}
                            />
                          </RowActions>
                        </TableCell>
                      </TableRow>
                    ))}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </ListCard>

      <ServiceItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={editing}
        vehicles={vehicles}
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
