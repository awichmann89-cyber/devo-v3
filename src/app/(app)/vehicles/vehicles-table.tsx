"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { VehicleDialog, VehicleVM } from "./vehicle-dialog";
import { deleteVehicle } from "./actions";
import { toast } from "sonner";
import { toastBlocked } from "@/lib/toast";
import { vehicleKindLabel } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { VehicleKind } from "@prisma/client";

type Row = VehicleVM & {
  assignmentCount: number;
  /** Anzahl Einsätze mit Konflikt (Überschneidung oder selber Tag). */
  conflictCount: number;
};

// Fahrzeuge zuerst, dann Anhänger — Reihenfolge der Gruppen in der Liste
const KIND_ORDER: VehicleKind[] = [VehicleKind.FAHRZEUG, VehicleKind.ANHAENGER];

/** Technische Kurzangaben einer Einheit: „1.200 kg Zuladung · 3.500 kg zGG". */
function specLabel(v: VehicleVM): string {
  const parts: string[] = [];
  if (v.loadCapacityKg != null) {
    parts.push(`${v.loadCapacityKg.toLocaleString("de-DE")} kg Zuladung`);
  }
  if (v.grossWeightKg != null) {
    parts.push(`${v.grossWeightKg.toLocaleString("de-DE")} kg zGG`);
  }
  if (v.requiredLicense) parts.push(`Klasse ${v.requiredLicense}`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/** HU/TÜV: fällig in ≤ 30 Tagen oder überschritten → Warnung. */
function inspectionDue(iso: string | null): "overdue" | "soon" | null {
  if (!iso) return null;
  const due = new Date(iso);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((+due - +today) / 86400000);
  if (days < 0) return "overdue";
  return days <= 30 ? "soon" : null;
}

export function VehiclesTable({ vehicles }: { vehicles: Row[] }) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VehicleVM | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [search, setSearch] = useState("");
  const [collapsedKinds, setCollapsedKinds] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const filtered = vehicles.filter((v) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      v.name.toLowerCase().includes(q) ||
      (v.licensePlate ?? "").toLowerCase().includes(q) ||
      (v.requiredLicense ?? "").toLowerCase().includes(q)
    );
  });

  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    label: vehicleKindLabel(kind),
    items: filtered.filter((v) => v.kind === kind),
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
  function openEdit(vehicle: VehicleVM) {
    setEditing(vehicle);
    setDialogOpen(true);
  }

  function onConfirmDelete() {
    if (!deleting) return;
    const id = deleting.id;
    startTransition(async () => {
      try {
        const res = await deleteVehicle(id);
        if (res.deactivated) {
          toast.info("Einheit hat Einsätze — auf inaktiv gesetzt");
        } else {
          toast.success("Fuhrpark-Einheit gelöscht");
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
        title="Fahrzeuge & Anhänger"
        info="Eigener Fuhrpark für die Transport-Disposition. Einheiten werden im Projekt an Transport-Positionen eingeplant, dort für den Planungszeitraum geblockt und auf Überbuchungen geprüft. Transport wird immer pauschal berechnet."
        action={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Fuhrpark-Einheit anlegen
          </Button>
        }
        count={{ shown: filtered.length, total: vehicles.length }}
        filters={
          <>
            <FilterSearch
              value={search}
              onChange={setSearch}
              placeholder="Bezeichnung, Kennzeichen oder Klasse…"
            />
            {search && <FilterResetButton onClick={() => setSearch("")} />}
          </>
        }
      >
        <Table density="comfortable">
          <TableHeader>
            <TableRow>
              <TableHead>Bezeichnung</TableHead>
              <TableHead>Kennzeichen</TableHead>
              <TableHead>Technische Daten</TableHead>
              <TableHead>HU/TÜV</TableHead>
              <TableHead className="text-right">Einsätze</TableHead>
              <TableHead className="w-[76px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableEmpty
                colSpan={6}
                hasData={vehicles.length > 0}
                entity="Fuhrpark-Einheiten"
              />
            )}
            {grouped.map((group) => {
              const isCollapsed = collapsedKinds.has(group.kind);
              return (
                <Fragment key={group.kind}>
                  <TableGroupRow
                    colSpan={6}
                    label={group.label}
                    count={group.items.length}
                    collapsed={isCollapsed}
                    onToggle={() => toggleKind(group.kind)}
                  />
                  {!isCollapsed &&
                    group.items.map((v) => {
                      const due = inspectionDue(v.nextInspection);
                      return (
                        <TableRow
                          key={v.id}
                          className={
                            v.active ? "cursor-pointer" : "cursor-pointer opacity-50"
                          }
                          onClick={() => router.push(`/vehicles/${v.id}`)}
                        >
                          <TableCell style={{ paddingLeft: groupChildIndent(0) }}>
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/vehicles/${v.id}`}
                                className="font-medium hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {v.name}
                              </Link>
                              {!v.active && <Badge variant="outline">Inaktiv</Badge>}
                              {v.conflictCount > 0 && (
                                <Badge
                                  variant="destructive"
                                  className="gap-1"
                                  title="Einsätze, die sich mit anderen Projekten überschneiden oder am selben Tag liegen"
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                  {v.conflictCount} Konflikt
                                  {v.conflictCount === 1 ? "" : "e"}
                                </Badge>
                              )}
                            </div>
                            {v.notes && (
                              <div className="line-clamp-1 text-xs text-muted-foreground">
                                {v.notes}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="num">
                            {v.licensePlate ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {specLabel(v)}
                          </TableCell>
                          <TableCell>
                            {v.nextInspection ? (
                              <span className="flex items-center gap-2">
                                {formatDate(v.nextInspection)}
                                {due === "overdue" && (
                                  <Badge variant="destructive">überfällig</Badge>
                                )}
                                {due === "soon" && (
                                  <Badge variant="warning">bald fällig</Badge>
                                )}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="num text-right">
                            {v.assignmentCount}
                          </TableCell>
                          <TableCell>
                            <RowActions density="comfortable">
                              <RowAction
                                icon={Pencil}
                                label="Bearbeiten"
                                onClick={() => openEdit(v)}
                              />
                              <RowAction
                                icon={Trash2}
                                label="Löschen"
                                destructive
                                disabled={pending}
                                onClick={() => setDeleting(v)}
                              />
                            </RowActions>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </ListCard>

      <VehicleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        vehicle={editing}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Fuhrpark-Einheit löschen?"
        description={
          deleting && (
            <>
              {deleting.assignmentCount > 0 ? (
                <>
                  <strong>{deleting.name}</strong> ist auf Projekte eingeplant und
                  kann nicht gelöscht werden (Dispositions-Historie). Die Einheit
                  wird stattdessen <strong>auf inaktiv gesetzt</strong>.
                </>
              ) : (
                <>
                  <strong>{deleting.name}</strong> wird unwiderruflich gelöscht.
                </>
              )}
            </>
          )
        }
        confirmLabel={
          deleting && deleting.assignmentCount > 0 ? "Deaktivieren" : "Löschen"
        }
        pending={pending}
        onConfirm={onConfirmDelete}
      />
    </>
  );
}
