"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmpty } from "@/components/ui/table-empty";
import { TableGroupRow, groupChildIndent } from "@/components/ui/table-group-row";
import { RowAction, RowActions } from "@/components/ui/row-actions";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { type Category, type Location } from "@prisma/client";
import { DeviceDialog } from "@/app/(app)/devices/device-dialog";
import { deleteDevice } from "@/app/(app)/devices/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { toastError } from "@/lib/toast";
import { groupItemsByCategory } from "@/lib/category-tree";

export interface DeviceVM {
  id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  description: string | null;
  stockQuantity: number;
  dailyRate: number;
  replacementValue: number | null;
  weight: number | null;
  powerWatts: number | null;
  inspectionExempt: boolean;
  showOnDocuments: boolean;
  categoryId: string | null;
  category: Category | null;
  createdAt: string;
  updatedAt: string;
  serialsTotal: number;
  serialsInspected: number;
  _count: { packUnitItems: number; serialNumbers: number };
}

export function DevicesSection({
  devices,
  categories,
  search,
}: {
  devices: DeviceVM[];
  categories: Category[];
  locations?: Location[];
  /** Suchbegriff — die Filterleiste liegt im ListCard-Header der Seite. */
  search: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<DeviceVM | null>(null);
  const [deleting, setDeleting] = useState<DeviceVM | null>(null);
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
        await deleteDevice(deleting.id);
        toast.success("Gerät gelöscht");
        setDeleting(null);
      } catch (e) {
        toastError(e, "Löschen");
      }
    });
  }

  const filtered = devices
    .filter((d) => {
      if (search) {
        const q = search.toLowerCase();
        const hay = `${d.name} ${d.manufacturer ?? ""} ${d.model ?? ""}`.toLowerCase();
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
            <TableHead>Name</TableHead>
            <TableHead>Beschreibung (extern)</TableHead>
            <TableHead className="text-right">Bestand</TableHead>
            <TableHead>Geprüft</TableHead>
            <TableHead className="text-right">€ / Tag</TableHead>
            <TableHead className="w-[76px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableEmpty colSpan={6} hasData={devices.length > 0} entity="Geräte" />
          ) : (
            groupItemsByCategory(filtered, categories).map((group) => {
              if (group.ancestorKeys.some((k) => collapsedCats.has(k))) {
                return null;
              }
              const isCollapsed = collapsedCats.has(group.key);
              return (
                <Fragment key={group.key}>
                  <TableGroupRow
                    colSpan={6}
                    label={group.name}
                    count={group.items.length}
                    depth={group.depth}
                    collapsed={isCollapsed}
                    onToggle={() => toggleCat(group.key)}
                  />
                  {!isCollapsed &&
                    group.items.map((d) => (
                      <TableRow
                        key={d.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/devices/${d.id}`)}
                      >
                        <TableCell style={{ paddingLeft: groupChildIndent(group.depth) }}>
                          <Link
                            href={`/devices/${d.id}`}
                            className="font-medium hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {d.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {d.description?.trim() || "—"}
                        </TableCell>
                        <TableCell className="num-strong text-right">
                          {d.stockQuantity}
                        </TableCell>
                        <TableCell>
                          {d.inspectionExempt ? (
                            <Badge variant="secondary" size="sm">
                              Nicht erforderlich
                            </Badge>
                          ) : d.serialsTotal === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <Badge
                              variant={
                                d.serialsInspected === d.serialsTotal ? "success" : "warning"
                              }
                              size="sm"
                            >
                              {d.serialsInspected} / {d.serialsTotal}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="num text-right">
                          {formatCurrency(Number(d.dailyRate))}
                        </TableCell>
                        <TableCell>
                          <RowActions density="comfortable">
                            <RowAction
                              icon={Pencil}
                              label="Bearbeiten"
                              onClick={() => setEditing(d)}
                            />
                            <RowAction
                              icon={Trash2}
                              label="Löschen"
                              destructive
                              disabled={pending}
                              onClick={() => setDeleting(d)}
                            />
                          </RowActions>
                        </TableCell>
                      </TableRow>
                    ))}
                </Fragment>
              );
            })
          )}
        </TableBody>
      </Table>

      {editing && (
        <DeviceDialog
          categories={categories}
          device={editing}
          open
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Gerät löschen?"
        description={
          deleting && (
            <>
              <strong>{deleting.name}</strong> wird unwiderruflich gelöscht. Alle zugehörigen Seriennummern und Prüfungen werden mitgelöscht.
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
