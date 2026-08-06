"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pencil, Trash2, Cable as CableIcon } from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/toast";
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
  replacementValue: number | null;
  weight: number | null;
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
  /** Suchbegriff — die Filterleiste liegt im ListCard-Header der Seite. */
  search: string;
}

export function CablesSection({ cables, categories, search }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<CableVM | null>(null);
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
        toastError(e, "Löschen");
      }
    });
  }

  return (
    <>
      <Table density="comfortable">
        <TableHeader>
          <TableRow>
            <TableHead>Bezeichnung</TableHead>
            <TableHead className="text-right">Länge</TableHead>
            <TableHead>Stecker</TableHead>
            <TableHead className="text-right">Bestand</TableHead>
            <TableHead>Geprüft</TableHead>
            <TableHead className="w-[76px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableEmpty colSpan={6} hasData={cables.length > 0} entity="Kabel" />
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
                    group.items.map((c) => {
                      const allInspected = c.unitsInspected === c.unitsTotal;
                      return (
                        <TableRow
                          key={c.id}
                          className="cursor-pointer"
                          onClick={() => router.push(`/material/cables/${c.id}`)}
                        >
                          <TableCell style={{ paddingLeft: groupChildIndent(group.depth) }}>
                            <Link
                              href={`/material/cables/${c.id}`}
                              className="block hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
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
                          <TableCell className="num text-right">
                            {c.lengthMeters ? `${c.lengthMeters} m` : "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {c.connectorA && c.connectorB
                              ? `${c.connectorA} → ${c.connectorB}`
                              : c.connectorA || c.connectorB || "—"}
                          </TableCell>
                          <TableCell className="num-strong text-right">
                            {c.stockQuantity}
                          </TableCell>
                          <TableCell>
                            {c.inspectionExempt ? (
                              <Badge variant="secondary" size="sm">
                                Nicht erforderlich
                              </Badge>
                            ) : (
                              <Badge variant={allInspected ? "success" : "warning"} size="sm">
                                {c.unitsInspected} / {c.unitsTotal}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <RowActions density="comfortable">
                              <RowAction
                                icon={Pencil}
                                label="Bearbeiten"
                                onClick={() => setEditing(c)}
                              />
                              <RowAction
                                icon={Trash2}
                                label="Löschen"
                                destructive
                                disabled={pending}
                                onClick={() => setDeleting(c)}
                              />
                            </RowActions>
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

      {editing && (
        <CableDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          cable={editing}
          categories={categories}
        />
      )}

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
    </>
  );
}
