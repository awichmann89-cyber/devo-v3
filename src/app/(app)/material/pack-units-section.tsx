"use client";

import { Fragment, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  ChevronRight,
  Boxes,
  Box,
  Pencil,
  X,
} from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { PackUnitDialog } from "@/app/(app)/pack-units/pack-unit-dialog";
import { flattenCategoryTree } from "@/lib/category-tree";
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
}

export function PackUnitsSection({ packUnits, categories, locations }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");

  function toggle(id: string) {
    const s = new Set(expanded);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setExpanded(s);
  }

  const filtered = packUnits.filter((pu) => {
    if (catFilter !== "all" && pu.categoryId !== catFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${pu.code} ${pu.name} ${pu.description ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const hasFilter = !!search || catFilter !== "all";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Suche..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Kategorie" />
          </SelectTrigger>
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
        {hasFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setCatFilter("all");
            }}
          >
            <X className="h-4 w-4" /> Filter zurücksetzen
          </Button>
        )}
        <div className="ml-auto">
          <PackUnitDialog locations={locations} categories={categories} />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]"></TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Kategorie</TableHead>
            <TableHead>Lagerort</TableHead>
            <TableHead className="text-right">Bestand</TableHead>
            <TableHead className="text-right">Inhalt</TableHead>
            <TableHead className="text-right">€ / Tag</TableHead>
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                {packUnits.length === 0
                  ? "Noch keine Packeinheiten angelegt"
                  : "Keine Treffer für die aktuellen Filter"}
              </TableCell>
            </TableRow>
          )}
          {filtered.map((pu) => {
            const stock = pu.stockQuantity ?? 1;
            const devicesPerUnit = pu.items.reduce((s, it) => s + it.quantity, 0);
            const dailyRatePerUnit = pu.items.reduce(
              (s, it) => s + Number(it.device.dailyRate) * it.quantity,
              0
            );
            const isOpen = expanded.has(pu.id);
            const hasItems = pu.items.length > 0;
            const Icon = pu.isSingleItem ? Box : Boxes;

            return (
              <Fragment key={pu.id}>
                <TableRow className="cursor-pointer" onClick={() => hasItems && toggle(pu.id)}>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
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
                      title={pu.isSingleItem ? "Einzelpackeinheit" : "Packeinheit"}
                    >
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <div className="font-medium">{pu.name}</div>
                        {pu.description && (
                          <div className="text-xs text-muted-foreground">{pu.description}</div>
                        )}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {pu.category?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {pu.location?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Badge variant="secondary" className="text-[10px]">
                      {stock}×
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <span className="tabular-nums">{devicesPerUnit}</span>
                    {devicesPerUnit > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        (= {devicesPerUnit * stock})
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(dailyRatePerUnit)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      asChild
                      title="Bearbeiten"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link href={`/pack-units/${pu.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
                {isOpen && hasItems && (
                  <TableRow key={pu.id + "-items"} className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={8} className="p-0">
                      <div className="px-12 py-3">
                        <div className="mb-2 flex items-center justify-between">
                          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Inhalt einer Packeinheit
                          </h4>
                          <Link
                            href={`/pack-units/${pu.id}`}
                            className="text-xs text-muted-foreground hover:text-foreground underline"
                          >
                            Inhalt verwalten →
                          </Link>
                        </div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-muted-foreground text-xs">
                              <th className="text-left py-1 w-[80px]">Stück pro Packeinheit</th>
                              <th className="text-left py-1">Bezeichnung</th>
                              <th className="text-left py-1">Hersteller / Modell</th>
                              <th className="text-left py-1">Kategorie</th>
                              <th className="text-right py-1">€ / Tag</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pu.items.map((it) => (
                              <tr key={it.id} className="border-t border-border/50">
                                <td className="py-1 tabular-nums text-xs font-medium">
                                  {it.quantity}×
                                </td>
                                <td className="py-1">
                                  <Link
                                    href={`/devices/${it.device.id}`}
                                    className="hover:underline font-medium"
                                  >
                                    {it.device.name}
                                  </Link>
                                </td>
                                <td className="py-1 text-muted-foreground text-xs">
                                  {[it.device.manufacturer, it.device.model]
                                    .filter(Boolean)
                                    .join(" ") || "—"}
                                </td>
                                <td className="py-1 text-muted-foreground text-xs">
                                  {it.device.category?.name ?? "—"}
                                </td>
                                <td className="py-1 text-right tabular-nums text-xs">
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
        </TableBody>
      </Table>
    </>
  );
}
