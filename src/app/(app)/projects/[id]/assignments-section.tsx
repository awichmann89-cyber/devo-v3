"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trash2,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Boxes,
  ArrowRight,
  Search,
  Plus,
  Pencil,
  FolderPlus,
  Folder,
  FolderOpen,
} from "lucide-react";
import {
  addAssignment,
  removeAssignment,
  updateAssignmentQuantity,
  moveAssignmentToGroup,
} from "../actions";
import {
  createProjectGroup,
  renameProjectGroup,
  deleteProjectGroup,
} from "./groups-actions";
import { toast } from "sonner";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { HorizontalSplit } from "@/components/ui/horizontal-split";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type {
  Project,
  ProjectAssignment,
  Device,
  Category,
  Location,
  PackUnit,
  PackUnitDevice,
  ProjectGroup,
} from "@prisma/client";

type DeviceLite = Device & { category?: Category | null };
type ItemFull = PackUnitDevice & { device: DeviceLite };
type PackUnitFull = PackUnit & { items: ItemFull[] };
type PackUnitLite = PackUnit & {
  items: (PackUnitDevice & { device: Device })[];
  location: Location | null;
  category: Category | null;
};
type AssignmentWithPackUnit = ProjectAssignment & { packUnit: PackUnitFull };

type OtherProject = {
  projectId: string;
  projectName: string;
  planningStart: Date;
  planningEnd: Date;
  quantity: number;
};
type StockInfo = { totalDemand: number; otherProjects: OtherProject[] };

interface Props {
  project: Project & { assignments: AssignmentWithPackUnit[] };
  allPackUnits: PackUnitLite[];
  conflictMap: Record<string, StockInfo>;
  billingDays: number;
  billingFactor: number;
  subtotal: number;
  discount: number;
  total: number;
  groups: ProjectGroup[];
}

function packUnitRate(items: { device: { dailyRate: { toString(): string } }; quantity: number }[]) {
  return items.reduce((s, it) => s + Number(it.device.dailyRate) * it.quantity, 0);
}

function devicesPerUnit(items: { quantity: number }[]) {
  return items.reduce((s, it) => s + it.quantity, 0);
}

interface ConflictPrompt {
  packUnitId: string;
  packUnitName: string;
  conflicts: { projectName: string; planningStart: Date; planningEnd: Date }[];
}

export function AssignmentsSection({
  project,
  allPackUnits,
  conflictMap,
  billingDays,
  billingFactor,
  subtotal,
  discount,
  total,
  groups,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [conflictPrompt, setConflictPrompt] = useState<ConflictPrompt | null>(null);

  // Aktive Gruppe (für neu hinzugefügte Items)
  const [activeGroupId, setActiveGroupId] = useState<string | null>(
    groups[0]?.id ?? null
  );
  useEffect(() => {
    if (!activeGroupId && groups[0]) setActiveGroupId(groups[0].id);
    if (activeGroupId && !groups.find((g) => g.id === activeGroupId)) {
      setActiveGroupId(groups[0]?.id ?? null);
    }
  }, [groups, activeGroupId]);

  // Gruppen-Management Dialoge
  const [groupDialog, setGroupDialog] = useState<{
    mode: "create" | "rename";
    id?: string;
    name: string;
  } | null>(null);
  const [deleteGroupPrompt, setDeleteGroupPrompt] = useState<ProjectGroup | null>(null);

  const assignedIds = new Set(project.assignments.map((a) => a.packUnitId));
  const availablePackUnits = allPackUnits
    .filter((p) => !assignedIds.has(p.id))
    .filter((p) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
    });

  function toggleExpand(id: string) {
    const s = new Set(expanded);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setExpanded(s);
  }

  async function handleAdd(packUnitId: string, force = false) {
    if (!activeGroupId) {
      // Auto-create default group if none exists
      try {
        const res = await createProjectGroup(project.id, {
          name: "Allgemein",
          kind: "MATERIAL",
        });
        setActiveGroupId(res.id);
        // Retry add with the new group
        startTransition(async () => {
          try {
            const r = await addAssignment(
              project.id,
              { packUnitId, groupId: res.id, quantity: 1 },
              force
            );
            if (!r.ok && r.conflicts) {
              const pu = allPackUnits.find((p) => p.id === packUnitId);
              setConflictPrompt({
                packUnitId,
                packUnitName: pu ? `${pu.code} — ${pu.name}` : "",
                conflicts: r.conflicts,
              });
              return;
            }
            toast.success("Packeinheit hinzugefügt");
            setConflictPrompt(null);
          } catch (e) {
            toast.error("Fehler", { description: e instanceof Error ? e.message : "" });
          }
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler beim Anlegen der Gruppe");
      }
      return;
    }

    startTransition(async () => {
      try {
        const res = await addAssignment(
          project.id,
          { packUnitId, groupId: activeGroupId, quantity: 1 },
          force
        );
        if (!res.ok && res.conflicts) {
          const pu = allPackUnits.find((p) => p.id === packUnitId);
          setConflictPrompt({
            packUnitId,
            packUnitName: pu ? `${pu.code} — ${pu.name}` : "",
            conflicts: res.conflicts,
          });
          return;
        }
        toast.success("Packeinheit hinzugefügt");
        setConflictPrompt(null);
      } catch (e) {
        toast.error("Fehler", { description: e instanceof Error ? e.message : "" });
      }
    });
  }

  function handleRemove(assignmentId: string) {
    startTransition(async () => {
      try {
        await removeAssignment(project.id, assignmentId);
        toast.success("Packeinheit entfernt");
      } catch (e) {
        toast.error("Fehler", { description: e instanceof Error ? e.message : "" });
      }
    });
  }

  function handleQtyChange(assignmentId: string, qty: number) {
    if (qty < 1) return;
    startTransition(async () => {
      try {
        await updateAssignmentQuantity(project.id, assignmentId, qty);
      } catch (e) {
        toast.error("Fehler", { description: e instanceof Error ? e.message : "" });
      }
    });
  }

  function handleMoveToGroup(assignmentId: string, groupId: string) {
    startTransition(async () => {
      try {
        await moveAssignmentToGroup(project.id, assignmentId, groupId);
      } catch (e) {
        toast.error("Fehler", { description: e instanceof Error ? e.message : "" });
      }
    });
  }

  function handleSaveGroup() {
    if (!groupDialog) return;
    const name = groupDialog.name.trim();
    if (!name) {
      toast.error("Name darf nicht leer sein");
      return;
    }
    startTransition(async () => {
      try {
        if (groupDialog.mode === "create") {
          const res = await createProjectGroup(project.id, { name, kind: "MATERIAL" });
          setActiveGroupId(res.id);
          toast.success("Gruppe angelegt");
        } else if (groupDialog.id) {
          await renameProjectGroup(groupDialog.id, name);
          toast.success("Gruppe umbenannt");
        }
        setGroupDialog(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleDeleteGroup(moveTo?: string | null) {
    if (!deleteGroupPrompt) return;
    const gid = deleteGroupPrompt.id;
    startTransition(async () => {
      try {
        await deleteProjectGroup(gid, moveTo ?? null);
        toast.success(
          moveTo
            ? "Gruppe gelöscht — Items verschoben"
            : "Gruppe inkl. Items gelöscht"
        );
        setDeleteGroupPrompt(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  // Assignments nach Gruppe gruppieren
  const assignmentsByGroup = new Map<string, AssignmentWithPackUnit[]>();
  for (const a of project.assignments) {
    const arr = assignmentsByGroup.get(a.groupId) ?? [];
    arr.push(a);
    assignmentsByGroup.set(a.groupId, arr);
  }

  return (
    <>
      <HorizontalSplit
        storageKey="devo:material-split"
        defaultLeftPx={320}
        minLeftPx={260}
        minRightPx={420}
        className="lg:min-h-[calc(100vh-380px)] lg:items-stretch"
        left={
          <Card className="border-0 shadow-none lg:h-full flex flex-col">
            <CardHeader className="px-0 pt-0 pb-3 space-y-2">
              <h2 className="text-base font-semibold">Verfügbares Material</h2>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Suchen..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 pl-8"
                />
              </div>
              {groups.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground shrink-0">Hinzufügen zu:</span>
                  <Select
                    value={activeGroupId ?? ""}
                    onValueChange={(v) => setActiveGroupId(v)}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Gruppe wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {groups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0">
              <div className="h-full overflow-y-auto">
                {availablePackUnits.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                    Keine passenden Packeinheiten
                  </p>
                ) : (
                  (() => {
                    // Gruppieren nach Kategorie (Name), null = "Ohne Kategorie"
                    const byCat = new Map<
                      string,
                      { catName: string; catKey: string; items: typeof availablePackUnits }
                    >();
                    for (const p of availablePackUnits) {
                      const key = p.category?.id ?? "__none__";
                      const name = p.category?.name ?? "Ohne Kategorie";
                      const entry = byCat.get(key) ?? {
                        catName: name,
                        catKey: key,
                        items: [],
                      };
                      entry.items.push(p);
                      byCat.set(key, entry);
                    }
                    const sorted = Array.from(byCat.values()).sort((a, b) =>
                      a.catName.localeCompare(b.catName, "de")
                    );
                    return (
                      <ul className="divide-y">
                        {sorted.map((cat) => {
                          const isCollapsed = collapsedCats.has(cat.catKey);
                          return (
                            <li key={cat.catKey}>
                              <button
                                type="button"
                                className="flex w-full items-center gap-1.5 bg-muted/50 px-3 py-2 text-left text-xs font-semibold hover:bg-muted"
                                onClick={() => {
                                  const s = new Set(collapsedCats);
                                  if (s.has(cat.catKey)) s.delete(cat.catKey);
                                  else s.add(cat.catKey);
                                  setCollapsedCats(s);
                                }}
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
                                <span className="truncate flex-1">{cat.catName}</span>
                                <span className="shrink-0 text-muted-foreground font-normal">
                                  {cat.items.length}
                                </span>
                              </button>
                              {!isCollapsed && (
                                <ul className="divide-y">
                                  {cat.items.map((p) => {
                                    const rate = packUnitRate(p.items);
                                    const totalDevs = devicesPerUnit(p.items);
                                    return (
                                      <li
                                        key={p.id}
                                        className="group flex items-center gap-2 pl-8 pr-3 py-2 hover:bg-accent/40"
                                      >
                                        <div className="flex-1 min-w-0">
                                          <div className="truncate text-sm font-medium">
                                            {p.name}
                                          </div>
                                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                                            <span>{totalDevs} Geräte / Case</span>
                                            <span>·</span>
                                            <span>{p.stockQuantity ?? 1}× Bestand</span>
                                            <span>·</span>
                                            <span>{formatCurrency(rate)}/T</span>
                                          </div>
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 shrink-0 opacity-60 group-hover:opacity-100"
                                          disabled={pending}
                                          onClick={() => handleAdd(p.id)}
                                          title={
                                            activeGroupId
                                              ? `Zur Gruppe „${groups.find((g) => g.id === activeGroupId)?.name}“ hinzufügen`
                                              : "Eine Standardgruppe wird automatisch angelegt"
                                          }
                                        >
                                          <ArrowRight className="h-4 w-4" />
                                        </Button>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    );
                  })()
                )}
              </div>
            </CardContent>
          </Card>
        }
        right={
          <div className="space-y-4 lg:h-full lg:overflow-y-auto lg:pr-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">
                Zugewiesen ({project.assignments.length})
              </h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setGroupDialog({ mode: "create", name: "" })}
              >
                <FolderPlus className="h-4 w-4" /> Neue Gruppe
              </Button>
            </div>

            {groups.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
                  <Boxes className="h-8 w-8 opacity-30" />
                  <p className="text-sm">
                    Lege eine Gruppe an (z.B. „Ton", „Licht", „Video"), um Material
                    zuzuordnen.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setGroupDialog({ mode: "create", name: "" })}
                  >
                    <FolderPlus className="h-4 w-4" /> Erste Gruppe anlegen
                  </Button>
                </CardContent>
              </Card>
            ) : (
              groups.map((group) => {
                const groupAssignments = assignmentsByGroup.get(group.id) ?? [];
                const groupSubtotal = groupAssignments.reduce((sum, a) => {
                  return sum + packUnitRate(a.packUnit.items) * a.quantity * billingFactor;
                }, 0);
                const otherGroups = groups.filter((g) => g.id !== group.id);
                const isActive = activeGroupId === group.id;
                return (
                  <Card
                    key={group.id}
                    className={cn(
                      "transition-shadow",
                      isActive && "border-primary/60 shadow-md"
                    )}
                  >
                    <CardHeader
                      className="flex flex-row items-center justify-between space-y-0 pb-3 cursor-pointer"
                      onClick={() => setActiveGroupId(group.id)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <CardTitle className="text-base truncate">
                          {group.name}
                        </CardTitle>
                        <Badge variant="outline" className="text-[10px]">
                          {groupAssignments.length}
                        </Badge>
                        {isActive && (
                          <Badge variant="secondary" className="text-[10px]">
                            Aktiv
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            setGroupDialog({
                              mode: "rename",
                              id: group.id,
                              name: group.name,
                            });
                          }}
                          title="Umbenennen"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteGroupPrompt(group);
                          }}
                          title="Löschen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="pb-3">
                      {groupAssignments.length === 0 ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">
                          Noch nichts in dieser Gruppe. Wähle eine Position aus dem
                          Katalog (Pfeil-Button) — sie wird der aktiven Gruppe
                          hinzugefügt.
                        </p>
                      ) : (
                        <Table className="[&_td]:py-2 [&_td]:px-2 [&_th]:h-9 [&_th]:px-2">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[40px]"></TableHead>
                              <TableHead>Code</TableHead>
                              <TableHead>Bezeichnung</TableHead>
                              <TableHead className="text-right">Geräte/Case</TableHead>
                              <TableHead className="text-right">Anzahl</TableHead>
                              <TableHead className="text-right">€ / Tag</TableHead>
                              <TableHead className="text-right">Tage (Faktor)</TableHead>
                              <TableHead className="text-right">Gesamt</TableHead>
                              <TableHead className="w-[80px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {groupAssignments.map((a) => {
                              const stockInfo = conflictMap[a.packUnitId];
                              const otherProjects = stockInfo?.otherProjects ?? [];
                              const totalDemand = stockInfo?.totalDemand ?? a.quantity;
                              const stockQty = a.packUnit.stockQuantity ?? 1;
                              const isOverStock = totalDemand > stockQty;
                              const freeAfter = stockQty - totalDemand;
                              const rate = packUnitRate(a.packUnit.items);
                              const devCount = devicesPerUnit(a.packUnit.items);
                              const lineTotal = rate * a.quantity * billingFactor;
                              const isExpanded = expanded.has(a.id);
                              return (
                                <Fragment key={a.id}>
                                  <TableRow
                                    className={cn(
                                      isOverStock &&
                                        "bg-red-50/70 hover:bg-red-50 dark:bg-red-950/30 dark:hover:bg-red-950/40"
                                    )}
                                  >
                                    <TableCell>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => toggleExpand(a.id)}
                                        disabled={a.packUnit.items.length === 0}
                                      >
                                        {isExpanded ? (
                                          <ChevronDown className="h-4 w-4" />
                                        ) : (
                                          <ChevronRight className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </TableCell>
                                    <TableCell className="font-mono text-sm">
                                      {a.packUnit.code}
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-2 font-medium">
                                        <Boxes className="h-4 w-4 text-muted-foreground" />
                                        {a.packUnit.name}
                                      </div>
                                      {otherProjects.length > 0 && (
                                        <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-yellow-600">
                                          <AlertTriangle className="h-3 w-3" />
                                          {otherProjects.map((p) => (
                                            <Badge
                                              key={p.projectId}
                                              variant="warning"
                                              className="text-[10px]"
                                            >
                                              {p.projectName} × {p.quantity} (
                                              {formatDate(p.planningStart)})
                                            </Badge>
                                          ))}
                                        </div>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right text-sm text-muted-foreground">
                                      {devCount}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex flex-col items-end">
                                        <Input
                                          type="number"
                                          min="1"
                                          value={a.quantity}
                                          onChange={(e) =>
                                            handleQtyChange(a.id, Number(e.target.value))
                                          }
                                          disabled={pending}
                                          className="h-8 w-16 text-right tabular-nums"
                                        />
                                        <span
                                          className={cn(
                                            "mt-0.5 text-[10px]",
                                            isOverStock
                                              ? "font-semibold text-destructive"
                                              : "text-muted-foreground"
                                          )}
                                        >
                                          {freeAfter} frei / {stockQty} Bestand
                                        </span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {formatCurrency(rate)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {billingDays} <span className="text-muted-foreground">({billingFactor.toString().replace(".", ",")})</span>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums font-medium">
                                      {formatCurrency(lineTotal)}
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex gap-0.5">
                                        {otherGroups.length > 0 && (
                                          <Select
                                            value=""
                                            onValueChange={(v) =>
                                              handleMoveToGroup(a.id, v)
                                            }
                                          >
                                            <SelectTrigger
                                              className="h-7 w-7 p-0 [&>svg]:hidden"
                                              title="In andere Gruppe verschieben"
                                            >
                                              <ChevronRight className="h-3.5 w-3.5 mx-auto" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {otherGroups.map((g) => (
                                                <SelectItem key={g.id} value={g.id}>
                                                  → {g.name}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        )}
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-destructive hover:text-destructive"
                                          onClick={() => handleRemove(a.id)}
                                          disabled={pending}
                                          title="Entfernen"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                  {isExpanded && a.packUnit.items.length > 0 && (
                                    <TableRow
                                      key={a.id + "-items"}
                                      className="bg-muted/30"
                                    >
                                      <TableCell colSpan={9} className="p-0">
                                        <div className="px-12 py-3">
                                          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                                            Enthaltene Geräte (pro Case)
                                            {a.quantity > 1 && (
                                              <span className="ml-2 font-normal lowercase">
                                                — × {a.quantity} Buchungen ={" "}
                                                {a.quantity * devCount} Geräte gesamt
                                              </span>
                                            )}
                                          </div>
                                          <table className="w-full text-sm">
                                            <thead>
                                              <tr className="text-muted-foreground text-xs">
                                                <th className="text-left py-1">
                                                  Bezeichnung
                                                </th>
                                                <th className="text-left py-1">
                                                  Kategorie
                                                </th>
                                                <th className="text-right py-1">
                                                  Pro Case
                                                </th>
                                                <th className="text-right py-1">
                                                  Gesamt
                                                </th>
                                                <th className="text-right py-1">
                                                  € / Tag
                                                </th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {a.packUnit.items.map((it) => (
                                                <tr
                                                  key={it.id}
                                                  className="border-t border-border/50"
                                                >
                                                  <td className="py-1">
                                                    {it.device.name}
                                                  </td>
                                                  <td className="py-1 text-muted-foreground text-xs">
                                                    {it.device.category?.name ?? "—"}
                                                  </td>
                                                  <td className="py-1 text-right tabular-nums text-xs">
                                                    × {it.quantity}
                                                  </td>
                                                  <td className="py-1 text-right tabular-nums text-xs font-medium">
                                                    {it.quantity * a.quantity}
                                                  </td>
                                                  <td className="py-1 text-right tabular-nums text-xs">
                                                    {formatCurrency(
                                                      Number(it.device.dailyRate) *
                                                        it.quantity *
                                                        a.quantity
                                                    )}
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
                            <TableRow>
                              <TableCell colSpan={7} className="text-right font-medium">
                                Gruppen-Zwischensumme
                              </TableCell>
                              <TableCell className="text-right font-mono font-medium">
                                {formatCurrency(groupSubtotal)}
                              </TableCell>
                              <TableCell />
                            </TableRow>
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}

            {project.assignments.length > 0 && (
              <Card>
                <CardContent className="py-3 space-y-1 text-sm">
                  <div className="flex justify-between font-bold">
                    <span>Material-Summe</span>
                    <span className="font-mono tabular-nums">
                      {formatCurrency(subtotal)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        }
      />

      {/* Gruppen-Edit-Dialog (create + rename) */}
      <Dialog
        open={groupDialog !== null}
        onOpenChange={(o) => !o && setGroupDialog(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {groupDialog?.mode === "create" ? "Neue Gruppe" : "Gruppe umbenennen"}
            </DialogTitle>
            <DialogDescription>
              Gruppen sind nur dieses Projekt — z.B. „Ton", „Licht", „Video".
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveGroup();
            }}
            className="space-y-3"
          >
            <Input
              autoFocus
              value={groupDialog?.name ?? ""}
              onChange={(e) =>
                setGroupDialog((g) => (g ? { ...g, name: e.target.value } : g))
              }
              placeholder="Gruppen-Name"
              maxLength={100}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setGroupDialog(null)}
                disabled={pending}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Speichern
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Gruppen-Lösch-Dialog */}
      <DeleteGroupDialog
        group={deleteGroupPrompt}
        otherGroups={
          deleteGroupPrompt
            ? groups.filter((g) => g.id !== deleteGroupPrompt.id)
            : []
        }
        itemCount={
          deleteGroupPrompt
            ? (assignmentsByGroup.get(deleteGroupPrompt.id) ?? []).length
            : 0
        }
        pending={pending}
        onCancel={() => setDeleteGroupPrompt(null)}
        onConfirm={handleDeleteGroup}
      />

      {/* Konflikt-Dialog */}
      <Dialog
        open={!!conflictPrompt}
        onOpenChange={(o) => !o && setConflictPrompt(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Packeinheit bereits gebucht
            </DialogTitle>
            <DialogDescription>
              <strong>{conflictPrompt?.packUnitName}</strong> ist im
              Planungszeitraum dieses Projekts bereits anderweitig verplant.
            </DialogDescription>
          </DialogHeader>
          {conflictPrompt && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <ul className="space-y-1">
                {conflictPrompt.conflicts.map((c, i) => (
                  <li key={i}>
                    <strong>{c.projectName}</strong> ({formatDate(c.planningStart)} –{" "}
                    {formatDate(c.planningEnd)})
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConflictPrompt(null)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                conflictPrompt && handleAdd(conflictPrompt.packUnitId, true)
              }
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Trotzdem hinzufügen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DeleteGroupDialog({
  group,
  otherGroups,
  itemCount,
  pending,
  onCancel,
  onConfirm,
}: {
  group: ProjectGroup | null;
  otherGroups: ProjectGroup[];
  itemCount: number;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (moveTo?: string | null) => void;
}) {
  const [moveTo, setMoveTo] = useState<string>("");
  useEffect(() => {
    setMoveTo("");
  }, [group?.id]);

  if (!group) {
    return (
      <ConfirmDialog
        open={false}
        onOpenChange={() => {}}
        title=""
        onConfirm={() => {}}
      />
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Gruppe „{group.name}" löschen?
          </DialogTitle>
          <DialogDescription>
            {itemCount === 0 ? (
              <>Diese Gruppe ist leer und wird gelöscht.</>
            ) : (
              <>
                In dieser Gruppe befinden sich <strong>{itemCount}</strong>{" "}
                Position(en).
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {itemCount > 0 && otherGroups.length > 0 && (
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Positionen in andere Gruppe verschieben?
            </p>
            <Select value={moveTo} onValueChange={setMoveTo}>
              <SelectTrigger>
                <SelectValue placeholder="— Mitlöschen —" />
              </SelectTrigger>
              <SelectContent>
                {otherGroups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Abbrechen
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => onConfirm(moveTo || null)}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {moveTo ? "Verschieben & Löschen" : "Löschen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
