"use client";

import { Fragment, useState, useTransition } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { DeviceStatus, type Category, type Location } from "@prisma/client";
import { deviceStatusLabel } from "@/lib/labels";
import { DeviceDialog } from "@/app/(app)/devices/device-dialog";
import { deleteDevice } from "@/app/(app)/devices/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { flattenCategoryTree, groupItemsByCategory } from "@/lib/category-tree";

export interface DeviceVM {
  id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  description: string | null;
  status: DeviceStatus;
  stockQuantity: number;
  dailyRate: number;
  replacementValue: number | null;
  weight: number | null;
  powerWatts: number | null;
  inspectionExempt: boolean;
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
  locations,
}: {
  devices: DeviceVM[];
  categories: Category[];
  locations: Location[];
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
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
        toast.error("Löschen fehlgeschlagen", {
          description: e instanceof Error ? e.message : "",
        });
      }
    });
  }

  const filtered = devices
    .filter((d) => {
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (catFilter !== "all" && d.categoryId !== catFilter) return false;
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
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Suche..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            {Object.values(DeviceStatus).map((s) => (
              <SelectItem key={s} value={s}>{deviceStatusLabel(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Kategorie" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Kategorien</SelectItem>
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
        <div className="ml-auto">
          <DeviceDialog categories={categories} locations={locations} />
        </div>
      </div>

      <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:h-10 [&_th]:px-3">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Hersteller / Modell</TableHead>
            <TableHead className="text-right">Bestand</TableHead>
            <TableHead>Geprüft</TableHead>
            <TableHead className="text-right">€ / Tag</TableHead>
            <TableHead className="w-[90px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                Keine Geräte gefunden
              </TableCell>
            </TableRow>
          ) : (
            groupItemsByCategory(filtered, categories).map((group) => {
              const isCollapsed = collapsedCats.has(group.key);
              return (
                <Fragment key={group.key}>
                  <TableRow
                    className="cursor-pointer bg-muted/30 hover:bg-muted/50"
                    onClick={() => toggleCat(group.key)}
                  >
                    <TableCell colSpan={6} className="py-2">
                      <div
                        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide"
                        style={{ paddingLeft: `${group.depth * 1.25}rem` }}
                      >
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
                        <span className="truncate">{group.name}</span>
                        <span className="ml-1 font-normal text-muted-foreground normal-case">
                          ({group.items.length})
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                  {!isCollapsed &&
                    group.items.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Link href={`/devices/${d.id}`} className="font-medium hover:underline">
                              {d.name}
                            </Link>
                            {d.inspectionExempt && (
                              <Badge variant="secondary" className="text-[10px]">
                                Prüfung nicht erforderlich
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {[d.manufacturer, d.model].filter(Boolean).join(" ") || "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {d.stockQuantity}
                        </TableCell>
                        <TableCell>
                          {d.inspectionExempt ? (
                            <Badge variant="secondary" className="text-[10px]">
                              Nicht erforderlich
                            </Badge>
                          ) : d.serialsTotal === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <Badge
                              variant={
                                d.serialsInspected === d.serialsTotal ? "success" : "warning"
                              }
                              className="text-[10px]"
                            >
                              {d.serialsInspected} / {d.serialsTotal}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(Number(d.dailyRate))}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" asChild title="Bearbeiten">
                              <Link href={`/devices/${d.id}`}>
                                <Pencil className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Löschen"
                              disabled={pending}
                              onClick={() => setDeleting(d)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </Fragment>
              );
            })
          )}
        </TableBody>
      </Table>

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
