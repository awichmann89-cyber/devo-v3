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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Boxes, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { PackUnitDialog } from "@/app/(app)/pack-units/pack-unit-dialog";
import { groupItemsByCategory } from "@/lib/category-tree";
import { deletePackUnit } from "@/app/(app)/pack-units/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { isRedirectError, toastError } from "@/lib/toast";
import type {
  Category,
  Device,
  Location,
  PackUnit,
  PackUnitDevice,
} from "@prisma/client";

type DeviceWithCategory = Device & { category: Category | null };
type ItemVM = PackUnitDevice & { device: DeviceWithCategory };
type PackUnitWithItems = PackUnit & {
  location: Location | null;
  category: Category | null;
  items: ItemVM[];
};

interface Props {
  packUnits: PackUnitWithItems[];
  categories: Category[];
  locations: Location[];
  /** Suchbegriff — die Filterleiste liegt im ListCard-Header der Seite. */
  search: string;
}

export function PackUnitsSection({ packUnits, categories, locations, search }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<PackUnitWithItems | null>(null);
  const [deleting, setDeleting] = useState<PackUnitWithItems | null>(null);
  const [pending, startTransition] = useTransition();
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());

  function toggleCat(key: string) {
    setCollapsedCats((prev) => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key);
      else s.add(key);
      return s;
    });
  }

  function onConfirmDelete() {
    if (!deleting) return;
    startTransition(async () => {
      try {
        await deletePackUnit(deleting.id);
        toast.success("Packeinheit gelöscht");
        setDeleting(null);
      } catch (e) {
        if (isRedirectError(e)) throw e;
        toastError(e, "Löschen");
      }
    });
  }

  function toggle(id: string) {
    const s = new Set(expanded);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setExpanded(s);
  }

  const filtered = packUnits
    .filter((pu) => {
      if (search) {
        const q = search.toLowerCase();
        const hay = `${pu.code} ${pu.name} ${pu.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  return (
    <>
      <Table density="comfortable">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]"></TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Lagerort</TableHead>
            <TableHead className="text-right">Bestand</TableHead>
            <TableHead className="text-right">Inhalt</TableHead>
            <TableHead className="text-right">€ / Tag</TableHead>
            <TableHead className="w-[76px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableEmpty colSpan={7} hasData={packUnits.length > 0} entity="Packeinheiten" />
          ) : (
            groupItemsByCategory(filtered, categories).map((group) => {
              if (group.ancestorKeys.some((k) => collapsedCats.has(k))) {
                return null;
              }
              const isCatCollapsed = collapsedCats.has(group.key);
              return (
                <Fragment key={group.key}>
                  <TableGroupRow
                    colSpan={7}
                    label={group.name}
                    count={group.items.length}
                    depth={group.depth}
                    collapsed={isCatCollapsed}
                    onToggle={() => toggleCat(group.key)}
                  />
                  {!isCatCollapsed && group.items.map((pu) => {
                    const stock = pu.stockQuantity ?? 1;
                    const devicesPerUnit = pu.items.reduce((s, it) => s + it.quantity, 0);
                    const dailyRatePerUnit = pu.items.reduce(
                      (s, it) => s + Number(it.device.dailyRate) * it.quantity,
                      0
                    );
                    const isOpen = expanded.has(pu.id);
                    const hasItems = pu.items.length > 0;

                    return (
                      <Fragment key={pu.id}>
                        <TableRow className="cursor-pointer" onClick={() => hasItems && toggle(pu.id)}>
                          <TableCell style={{ paddingLeft: groupChildIndent(group.depth) }}>
                            <Button
                              variant="ghost"
                              size="iconXs"
                              aria-label={isOpen ? "Inhalt einklappen" : "Inhalt ausklappen"}
                              title={isOpen ? "Inhalt einklappen" : "Inhalt ausklappen"}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggle(pu.id);
                              }}
                              disabled={!hasItems}
                            >
                              {isOpen ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/pack-units/${pu.id}`}
                              className="flex items-center gap-2 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Boxes className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <div>
                                <div className="flex items-center gap-2 font-medium">
                                  {pu.name}
                                  <Badge
                                    variant={pu.packMode === "VARIABLE" ? "outline" : "secondary"}
                                    size="sm"
                                  >
                                    {pu.packMode === "VARIABLE" ? "Variabel" : "Fix"}
                                  </Badge>
                                </div>
                                {pu.description && (
                                  <div className="text-xs text-muted-foreground">{pu.description}</div>
                                )}
                              </div>
                            </Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {pu.location?.name ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary" size="sm">
                              {stock}×
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="num">{devicesPerUnit}</span>
                            {devicesPerUnit > 0 && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                (= {devicesPerUnit * stock})
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="num text-right">
                            {formatCurrency(dailyRatePerUnit)}
                          </TableCell>
                          <TableCell>
                            <RowActions density="comfortable">
                              <RowAction
                                icon={Pencil}
                                label="Bearbeiten"
                                onClick={() => setEditing(pu)}
                              />
                              <RowAction
                                icon={Trash2}
                                label="Löschen"
                                destructive
                                disabled={pending}
                                onClick={() => setDeleting(pu)}
                              />
                            </RowActions>
                          </TableCell>
                        </TableRow>
                        {isOpen && hasItems && (
                          <TableRow key={pu.id + "-items"} className="bg-secondary/60">
                            <TableCell colSpan={7} className="!p-0">
                              <div className="px-12 py-3">
                                <div className="mb-2 flex items-center justify-between">
                                  <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Inhalt einer Packeinheit
                                  </h4>
                                  <Link
                                    href={`/pack-units/${pu.id}`}
                                    className="text-xs text-muted-foreground underline hover:text-foreground"
                                  >
                                    Inhalt verwalten →
                                  </Link>
                                </div>
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="text-xs text-muted-foreground">
                                      <th className="w-[80px] py-1 text-left">Stück pro Packeinheit</th>
                                      <th className="py-1 text-left">Bezeichnung</th>
                                      <th className="py-1 text-left">Beschreibung (extern)</th>
                                      <th className="py-1 text-right">€ / Tag</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {pu.items.map((it) => (
                                      <tr key={it.id} className="border-t border-border/50">
                                        <td className="num py-1 text-xs font-medium">
                                          {it.quantity}×
                                        </td>
                                        <td className="py-1">
                                          <Link
                                            href={`/devices/${it.device.id}`}
                                            className="font-medium hover:underline"
                                          >
                                            {it.device.name}
                                          </Link>
                                        </td>
                                        <td className="py-1 text-xs text-muted-foreground">
                                          {it.device.description?.trim() || "—"}
                                        </td>
                                        <td className="num py-1 text-right text-xs">
                                          {formatCurrency(Number(it.device.dailyRate) * it.quantity)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
            })
          )}
        </TableBody>
      </Table>

      {editing && (
        <PackUnitDialog
          packUnit={editing}
          locations={locations}
          categories={categories}
          open
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Packeinheit löschen?"
        description={
          deleting && (
            <>
              <strong>{deleting.name}</strong> wird unwiderruflich gelöscht. Die enthaltenen Geräte bleiben bestehen — sie werden nur aus dieser Packeinheit gelöst.
            </>
          )
        }
        confirmLabel="Löschen"
        pending={pending}
        onConfirm={onConfirmDelete}
      />
    </>
  );
}
