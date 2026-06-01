"use client";

import { useState, useTransition } from "react";
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
import { Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { DeviceStatus, type Category, type Device, type Location } from "@prisma/client";
import { deviceStatusLabel, deviceStatusVariant } from "@/lib/labels";
import { DeviceDialog } from "@/app/(app)/devices/device-dialog";
import { deleteDevice } from "@/app/(app)/devices/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { flattenCategoryTree } from "@/lib/category-tree";

type DeviceVM = Device & {
  category: Category | null;
  _count: { packUnitItems: number; serialNumbers: number };
};

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
    .sort((a, b) => {
      // Kategorie-Gruppen zuerst, ohne Kategorie ans Ende
      const catA = a.category?.name ?? "￿";
      const catB = b.category?.name ?? "￿";
      const catCmp = catA.localeCompare(catB, "de");
      if (catCmp !== 0) return catCmp;
      return a.name.localeCompare(b.name, "de");
    });

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
            <TableHead>Kategorie</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Bestand</TableHead>
            <TableHead className="text-right">SN</TableHead>
            <TableHead className="text-right">€ / Tag</TableHead>
            <TableHead className="w-[90px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                Keine Geräte gefunden
              </TableCell>
            </TableRow>
          )}
          {filtered.map((d) => (
            <TableRow key={d.id}>
              <TableCell>
                <Link href={`/devices/${d.id}`} className="font-medium hover:underline">
                  {d.name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {[d.manufacturer, d.model].filter(Boolean).join(" ") || "—"}
              </TableCell>
              <TableCell>{d.category?.name ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={deviceStatusVariant(d.status)}>{deviceStatusLabel(d.status)}</Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {d.stockQuantity}
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                {d._count.serialNumbers > 0 ? `${d._count.serialNumbers}/${d.stockQuantity}` : "—"}
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
        </TableBody>
      </Table>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Gerät löschen?"
        description={
          deleting && (
            <>
              <strong>{deleting.name}</strong> wird unwiderruflich gelöscht.
              Seriennummern und Packeinheits-Verknüpfungen werden ebenfalls entfernt.
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
