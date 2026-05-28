"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Search, Trash2, Package, AlertTriangle } from "lucide-react";
import Link from "next/link";
import {
  addItemToPackUnit,
  removeItemFromPackUnit,
  updateItemQuantity,
} from "../actions";
import { toast } from "sonner";
import { cn, formatCurrency } from "@/lib/utils";
import type { Category, Device } from "@prisma/client";

type DeviceVM = Device & { category: Category | null };
type ItemVM = {
  id: string;
  deviceId: string;
  quantity: number;
  device: DeviceVM;
};

interface Props {
  packUnitId: string;
  stockQuantity: number;
  items: ItemVM[];
  allDevices: DeviceVM[];
  /** Pro Gerät: aktuelle Gesamt-Allokation (Σ PU.stock × item.qty) und Bestand */
  allocationByDeviceId: Record<string, { total: number; stock: number }>;
  /** Bei true: Packeinheit ist 1:1-Container für ein einzelnes Gerät */
  isSingleItem?: boolean;
}

export function ItemsManager({
  packUnitId,
  stockQuantity,
  items,
  allDevices,
  allocationByDeviceId,
  isSingleItem,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");

  const inUse = new Set(items.map((it) => it.deviceId));
  const available = allDevices
    .filter((d) => !inUse.has(d.id))
    .filter((d) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        d.name.toLowerCase().includes(q) ||
        (d.manufacturer ?? "").toLowerCase().includes(q) ||
        (d.model ?? "").toLowerCase().includes(q)
      );
    });

  function handleAdd(deviceId: string) {
    startTransition(async () => {
      try {
        await addItemToPackUnit(packUnitId, { deviceId, quantity: 1 });
        toast.success("Gerät hinzugefügt");
      } catch (e) {
        toast.error("Fehler", { description: e instanceof Error ? e.message : "" });
      }
    });
  }

  function handleQtyChange(itemId: string, q: number) {
    if (q < 1) return;
    startTransition(async () => {
      try {
        await updateItemQuantity(itemId, q);
      } catch (e) {
        toast.error("Fehler", { description: e instanceof Error ? e.message : "" });
      }
    });
  }

  function handleRemove(itemId: string) {
    startTransition(async () => {
      try {
        await removeItemFromPackUnit(itemId);
        toast.success("Gerät entfernt");
      } catch (e) {
        toast.error("Fehler", { description: e instanceof Error ? e.message : "" });
      }
    });
  }

  // Einzelpackeinheit: linke Auswahlliste ausblenden, wenn schon 1 Gerät zugeordnet
  const hideAvailable = isSingleItem === true && items.length >= 1;

  return (
    <div
      className={
        hideAvailable
          ? "grid gap-4"
          : "grid gap-4 lg:grid-cols-[320px_1fr]"
      }
    >
      {!hideAvailable && (
      <>
      {/* LINKS: Verfügbare Geräte-Typen */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Verfügbare Geräte-Typen</CardTitle>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Suchen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[600px] overflow-y-auto">
            {available.length === 0 && (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                {allDevices.length === 0
                  ? "Noch keine Geräte angelegt"
                  : "Alle passenden bereits in dieser Packeinheit"}
              </p>
            )}
            <ul className="divide-y">
              {available.map((d) => {
                const alloc = allocationByDeviceId[d.id];
                const allocTotal = alloc?.total ?? 0;
                const free = d.stockQuantity - allocTotal;
                return (
                <li
                  key={d.id}
                  className="group flex items-center gap-2 px-3 py-2 hover:bg-accent/40"
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium">{d.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      {(d.manufacturer || d.model) && (
                        <>
                          <span className="truncate">
                            {[d.manufacturer, d.model].filter(Boolean).join(" ")}
                          </span>
                          <span>·</span>
                        </>
                      )}
                      <span className={cn(free <= 0 && "text-destructive font-semibold")}>
                        {free} frei / {d.stockQuantity}
                      </span>
                      <span>·</span>
                      <span>{formatCurrency(Number(d.dailyRate))}/T</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 opacity-60 group-hover:opacity-100"
                    disabled={pending}
                    onClick={() => handleAdd(d.id)}
                    title="Zur Packeinheit hinzufügen"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </li>
                );
              })}
            </ul>
          </div>
        </CardContent>
      </Card>
      </>
      )}

      {/* RECHTS: Inhalt einer Packeinheit */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isSingleItem
              ? "Enthaltenes Gerät"
              : `Inhalt einer Packeinheit (${items.length} Typen)`}
          </CardTitle>
          {isSingleItem && (
            <p className="text-xs text-muted-foreground">
              Einzelpackeinheit: enthält genau ein Gerät als 1:1-Buchungseinheit.
            </p>
          )}
        </CardHeader>
        <CardContent>
          {(() => {
            const over = items.filter((it) => {
              const a = allocationByDeviceId[it.deviceId];
              return a && a.total > a.stock;
            });
            if (over.length === 0) return null;
            return (
              <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Überbelegung: {over.length} Gerät
                  {over.length === 1 ? "" : "e"} überbucht
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Der Gesamtbedarf (alle Packeinheiten × deren Lagerbestand) übersteigt
                  den vorhandenen Gerätebestand. Reduziere die Anzahl pro Case, den
                  Lagerbestand dieser Packeinheit, oder erhöhe den Geräte-Bestand.
                </div>
              </div>
            );
          })()}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bezeichnung</TableHead>
                <TableHead className="text-right">Stück pro Packeinheit</TableHead>
                {stockQuantity > 1 && (
                  <TableHead className="text-right">Gesamt (× {stockQuantity})</TableHead>
                )}
                <TableHead className="text-right">€ / Tag (gesamt)</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={stockQuantity > 1 ? 5 : 4}
                    className="text-center text-muted-foreground py-8"
                  >
                    <Package className="mx-auto mb-2 h-8 w-8 opacity-30" />
                    Noch keine Geräte in dieser Packeinheit
                    <div className="mt-1 text-xs">
                      Wähle links Geräte aus und klicke auf den Pfeil.
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {items.map((it) => {
                const alloc = allocationByDeviceId[it.deviceId];
                const isOver = alloc && alloc.total > alloc.stock;
                return (
                  <TableRow
                    key={it.id}
                    className={cn(
                      isOver &&
                        "bg-red-50/70 hover:bg-red-50 dark:bg-red-950/30 dark:hover:bg-red-950/40"
                    )}
                  >
                    <TableCell>
                      <Link href={`/devices/${it.device.id}`} className="hover:underline">
                        <div className="font-medium">{it.device.name}</div>
                        {it.device.manufacturer && (
                          <div className="text-xs text-muted-foreground">
                            {it.device.manufacturer} {it.device.model}
                          </div>
                        )}
                      </Link>
                      {alloc && (
                        <div
                          className={cn(
                            "mt-0.5 text-[10px]",
                            isOver
                              ? "font-semibold text-destructive"
                              : "text-muted-foreground"
                          )}
                        >
                          {isOver && <AlertTriangle className="inline h-3 w-3 mr-0.5" />}
                          {alloc.total} / {alloc.stock} Bestand belegt
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min="1"
                        value={it.quantity}
                        onChange={(e) => handleQtyChange(it.id, Number(e.target.value))}
                        disabled={pending || isSingleItem}
                        readOnly={isSingleItem}
                        title={isSingleItem ? "Einzelpackeinheit: Anzahl fest auf 1" : undefined}
                        className={cn(
                          "h-8 w-16 text-right tabular-nums ml-auto",
                          isOver && "border-destructive focus-visible:ring-destructive"
                        )}
                      />
                    </TableCell>
                    {stockQuantity > 1 && (
                      <TableCell className="text-right tabular-nums">
                        {it.quantity * stockQuantity}
                      </TableCell>
                    )}
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(Number(it.device.dailyRate) * it.quantity)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemove(it.id)}
                        disabled={pending}
                        title="Aus Packeinheit entfernen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
