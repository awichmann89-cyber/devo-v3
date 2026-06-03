"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  Cable as CableIcon,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
} from "lucide-react";
import { toast } from "sonner";
import { deleteCable } from "./cables-actions";
import { CableDialog } from "./cable-dialog";
import { groupItemsByCategory } from "@/lib/category-tree";

export interface CableVM {
  id: string;
  name: string;
  description: string | null;
  cableType: string | null;
  lengthMeters: number | null;
  connectorA: string | null;
  connectorB: string | null;
  stockQuantity: number;
  categoryId: string | null;
  categoryName: string | null;
  inspectionExempt: boolean;
  unitsTotal: number;
  unitsWithBarcode: number;
  unitsInspected: number;
}

interface CategoryOpt {
  id: string;
  name: string;
  parentId: string | null;
}

interface Props {
  cables: CableVM[];
  categories: CategoryOpt[];
}

export function CablesSection({ cables, categories }: Props) {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<CableVM | null>(null);
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

  const filtered = cables.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.cableType ?? "").toLowerCase().includes(q) ||
      (c.connectorA ?? "").toLowerCase().includes(q) ||
      (c.connectorB ?? "").toLowerCase().includes(q)
    );
  });

  function handleDelete() {
    if (!deleting) return;
    const id = deleting.id;
    startTransition(async () => {
      try {
        await deleteCable(id);
        toast.success("Kabel gelöscht");
        setDeleting(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Name, Typ, Stecker…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 pl-8"
          />
        </div>
        {search && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearch("")}
          >
            <X className="h-4 w-4" /> Filter zurücksetzen
          </Button>
        )}
        <div className="ml-auto">
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" /> Neues Kabel
          </Button>
        </div>
      </div>

      <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:h-10 [&_th]:px-3">
        <TableHeader>
          <TableRow>
            <TableHead>Bezeichnung</TableHead>
            <TableHead className="text-right">Länge</TableHead>
            <TableHead>Stecker</TableHead>
            <TableHead className="text-right">Bestand</TableHead>
            <TableHead>Geprüft</TableHead>
            <TableHead className="w-[90px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                Keine Kabel gefunden.
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
                    group.items.map((c) => {
                      const inspectionProgress = `${c.unitsInspected} / ${c.unitsTotal}`;
                      const allInspected = c.unitsInspected === c.unitsTotal;
                      return (
                        <TableRow key={c.id} className="hover:bg-accent/30">
                          <TableCell>
                            <Link href={`/material/cables/${c.id}`} className="block hover:underline">
                              <div className="flex items-center gap-2 font-medium">
                                <CableIcon className="h-4 w-4 text-muted-foreground" />
                                {c.name}
                              </div>
                              {c.cableType && (
                                <div className="text-[11px] text-muted-foreground">
                                  {c.cableType}
                                </div>
                              )}
                            </Link>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {c.lengthMeters ? `${c.lengthMeters} m` : "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {c.connectorA && c.connectorB
                              ? `${c.connectorA} → ${c.connectorB}`
                              : c.connectorA || c.connectorB || "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {c.stockQuantity}
                          </TableCell>
                          <TableCell>
                            {c.inspectionExempt ? (
                              <Badge variant="secondary" className="text-[10px]">
                                Nicht erforderlich
                              </Badge>
                            ) : (
                              <Badge
                                variant={allInspected ? "success" : "warning"}
                                className="text-[10px]"
                              >
                                {inspectionProgress}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" asChild title="Bearbeiten">
                                <Link href={`/material/cables/${c.id}`}>
                                  <Pencil className="h-4 w-4" />
                                </Link>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Löschen"
                                disabled={pending}
                                onClick={() => setDeleting(c)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </Fragment>
              );
            })
          )}
        </TableBody>
      </Table>

      <CableDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        cable={null}
        categories={categories}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Kabel löschen?"
        description={
          deleting && (
            <>
              <strong>{deleting.name}</strong> wird unwiderruflich gelöscht — inkl.{" "}
              <strong>{deleting.unitsTotal}</strong> Einzeleinheiten und deren Prüfhistorie.
            </>
          )
        }
        confirmLabel="Löschen"
        pending={pending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
