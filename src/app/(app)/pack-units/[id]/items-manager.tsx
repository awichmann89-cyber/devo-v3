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
import { QuantityInput } from "@/components/ui/quantity-input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowRight,
  Search,
  Trash2,
  Package,
  AlertTriangle,
  Cable as CableIcon,
} from "lucide-react";
import Link from "next/link";
import {
  addItemToPackUnit,
  removeItemFromPackUnit,
  updateItemQuantity,
  addCableToPackUnit,
  removeCableFromPackUnit,
  updateCableItemQuantity,
} from "../actions";
import { toast } from "sonner";
import { cn, formatCurrency } from "@/lib/utils";
import type { Cable, Category, Device } from "@prisma/client";

type DeviceVM = Device & { category: Category | null };
type CableVM = Cable & { category: Category | null };

type ItemVM = {
  id: string;
  deviceId: string;
  quantity: number;
  device: DeviceVM;
};

type CableItemVM = {
  id: string;
  cableId: string;
  quantity: number;
  cable: CableVM;
};

interface Props {
  packUnitId: string;
  stockQuantity: number;
  items: ItemVM[];
  cableItems: CableItemVM[];
  allDevices: DeviceVM[];
  allCables: CableVM[];
  /** Pro Gerät: aktuelle Gesamt-Allokation (Σ PU.stock × item.qty) und Bestand */
  allocationByDeviceId: Record<string, { total: number; stock: number }>;
  /** Analog für Kabel */
  allocationByCableId: Record<string, { total: number; stock: number }>;
}

export function ItemsManager({
  packUnitId,
  stockQuantity,
  items,
  cableItems,
  allDevices,
  allCables,
  allocationByDeviceId,
  allocationByCableId,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [deviceSearch, setDeviceSearch] = useState("");
  const [cableSearch, setCableSearch] = useState("");

  // ----- Devices -----
  const usedDeviceIds = new Set(items.map((it) => it.deviceId));
  const availableDevices = allDevices
    .filter((d) => !usedDeviceIds.has(d.id))
    .filter((d) => {
      if (!deviceSearch) return true;
      const q = deviceSearch.toLowerCase();
      return (
        d.name.toLowerCase().includes(q) ||
        (d.manufacturer ?? "").toLowerCase().includes(q) ||
        (d.model ?? "").toLowerCase().includes(q)
      );
    });

  function handleAddDevice(deviceId: string) {
    startTransition(async () => {
      try {
        await addItemToPackUnit(packUnitId, { deviceId, quantity: 1 });
        toast.success("Gerät hinzugefügt");
      } catch (e) {
        toast.error("Fehler", { description: e instanceof Error ? e.message : "" });
      }
    });
  }
  function handleDeviceQty(itemId: string, q: number) {
    if (q < 1) return;
    startTransition(async () => {
      try {
        await updateItemQuantity(itemId, q);
      } catch (e) {
        toast.error("Fehler", { description: e instanceof Error ? e.message : "" });
      }
    });
  }
  function handleRemoveDevice(itemId: string) {
    startTransition(async () => {
      try {
        await removeItemFromPackUnit(itemId);
        toast.success("Gerät entfernt");
      } catch (e) {
        toast.error("Fehler", { description: e instanceof Error ? e.message : "" });
      }
    });
  }

  // ----- Cables -----
  const usedCableIds = new Set(cableItems.map((it) => it.cableId));
  const availableCables = allCables
    .filter((c) => !usedCableIds.has(c.id))
    .filter((c) => {
      if (!cableSearch) return true;
      const q = cableSearch.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.cableType ?? "").toLowerCase().includes(q) ||
        (c.connectorA ?? "").toLowerCase().includes(q) ||
        (c.connectorB ?? "").toLowerCase().includes(q)
      );
    });

  function handleAddCable(cableId: string) {
    startTransition(async () => {
      try {
        await addCableToPackUnit(packUnitId, { cableId, quantity: 1 });
        toast.success("Kabel hinzugefügt");
      } catch (e) {
        toast.error("Fehler", { description: e instanceof Error ? e.message : "" });
      }
    });
  }
  function handleCableQty(itemId: string, q: number) {
    if (q < 1) return;
    startTransition(async () => {
      try {
        await updateCableItemQuantity(itemId, q);
      } catch (e) {
        toast.error("Fehler", { description: e instanceof Error ? e.message : "" });
      }
    });
  }
  function handleRemoveCable(itemId: string) {
    startTransition(async () => {
      try {
        await removeCableFromPackUnit(itemId);
        toast.success("Kabel entfernt");
      } catch (e) {
        toast.error("Fehler", { description: e instanceof Error ? e.message : "" });
      }
    });
  }

  return (
    <Tabs defaultValue="devices" className="space-y-4">
      <TabsList>
        <TabsTrigger value="devices">
          <Package className="h-4 w-4" /> Geräte
          <span className="ml-1 text-muted-foreground">({items.length})</span>
        </TabsTrigger>
        <TabsTrigger value="cables">
          <CableIcon className="h-4 w-4" /> Kabel
          <span className="ml-1 text-muted-foreground">({cableItems.length})</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="devices" className="mt-0">
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" /> Verfügbare Geräte-Typen
            </CardTitle>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suche…"
                value={deviceSearch}
                onChange={(e) => setDeviceSearch(e.target.value)}
                className="h-9 pl-8"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[400px] overflow-y-auto">
              {availableDevices.length === 0 && (
                <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                  {allDevices.length === 0
                    ? "Noch keine Geräte angelegt"
                    : "Alle passenden bereits in dieser Packeinheit"}
                </p>
              )}
              <ul className="divide-y">
                {availableDevices.map((d) => {
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
                          {d.description?.trim() && (
                            <>
                              <span className="truncate">{d.description}</span>
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
                        onClick={() => handleAddDevice(d.id)}
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Geräte in dieser Packeinheit ({items.length} Typen)
            </CardTitle>
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
                          "bg-destructive-subtle/70 hover:bg-destructive-subtle"
                      )}
                    >
                      <TableCell>
                        <Link href={`/devices/${it.device.id}`} className="hover:underline">
                          <div className="font-medium">{it.device.name}</div>
                          {it.device.description?.trim() && (
                            <div className="text-xs text-muted-foreground">
                              {it.device.description}
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
                        <QuantityInput
                          min={1}
                          value={it.quantity}
                          onChange={(v) => handleDeviceQty(it.id, v)}
                          disabled={pending}
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
                          onClick={() => handleRemoveDevice(it.id)}
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

      </TabsContent>

      <TabsContent value="cables" className="mt-0">
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CableIcon className="h-4 w-4" /> Verfügbare Kabel-Typen
            </CardTitle>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suche…"
                value={cableSearch}
                onChange={(e) => setCableSearch(e.target.value)}
                className="h-9 pl-8"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[400px] overflow-y-auto">
              {availableCables.length === 0 && (
                <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                  {allCables.length === 0
                    ? "Noch keine Kabel angelegt"
                    : "Alle passenden bereits in dieser Packeinheit"}
                </p>
              )}
              <ul className="divide-y">
                {availableCables.map((c) => {
                  const alloc = allocationByCableId[c.id];
                  const allocTotal = alloc?.total ?? 0;
                  const free = c.stockQuantity - allocTotal;
                  return (
                  <li
                    key={c.id}
                    className="group flex items-center gap-2 px-3 py-2 hover:bg-accent/40"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium">{c.name}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        {c.cableType && (
                          <>
                            <span>{c.cableType}</span>
                            <span>·</span>
                          </>
                        )}
                        <span className={cn(free <= 0 && "text-destructive font-semibold")}>
                          {free} frei / {c.stockQuantity}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 opacity-60 group-hover:opacity-100"
                      disabled={pending}
                      onClick={() => handleAddCable(c.id)}
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Kabel in dieser Packeinheit ({cableItems.length} Typen)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const over = cableItems.filter((it) => {
                const a = allocationByCableId[it.cableId];
                return a && a.total > a.stock;
              });
              if (over.length === 0) return null;
              return (
                <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    Überbelegung: {over.length} Kabel
                    {over.length === 1 ? "" : "-Typ"} überbucht
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Der Gesamtbedarf (alle Packeinheiten × deren Lagerbestand) übersteigt
                    den vorhandenen Kabel-Bestand. Reduziere die Anzahl pro Case, den
                    Lagerbestand dieser Packeinheit, oder erhöhe den Kabel-Bestand.
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
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cableItems.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={stockQuantity > 1 ? 4 : 3}
                      className="text-center text-muted-foreground py-8"
                    >
                      <CableIcon className="mx-auto mb-2 h-8 w-8 opacity-30" />
                      Noch keine Kabel in dieser Packeinheit
                      <div className="mt-1 text-xs">
                        Wähle links Kabel aus und klicke auf den Pfeil.
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {cableItems.map((it) => {
                  const alloc = allocationByCableId[it.cableId];
                  const isOver = alloc && alloc.total > alloc.stock;
                  return (
                  <TableRow
                    key={it.id}
                    className={cn(
                      isOver &&
                        "bg-destructive-subtle/70 hover:bg-destructive-subtle"
                    )}
                  >
                    <TableCell>
                      <div className="font-medium">{it.cable.name}</div>
                      {it.cable.cableType && (
                        <div className="text-xs text-muted-foreground">
                          {it.cable.cableType}
                          {it.cable.lengthMeters
                            ? ` · ${Number(it.cable.lengthMeters)} m`
                            : ""}
                        </div>
                      )}
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
                      <QuantityInput
                        min={1}
                        value={it.quantity}
                        onChange={(v) => handleCableQty(it.id, v)}
                        disabled={pending}
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
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveCable(it.id)}
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
      </TabsContent>
    </Tabs>
  );
}
