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
  Package,
  Boxes,
  ArrowRight,
  Search,
  Pencil,
  FolderPlus,
  Folder,
  FolderOpen,
  Printer,
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
import { cn, formatCurrency } from "@/lib/utils";
import { HorizontalSplit } from "@/components/ui/horizontal-split";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { groupItemsByCategory } from "@/lib/category-tree";
import type {
  Project,
  ProjectAssignment,
  Device,
  Category,
  ProjectGroup,
} from "@prisma/client";

type DeviceLite = Device & { category: Category | null };
type AssignmentWithDevice = ProjectAssignment & { device: DeviceLite };

type BlockingPack = {
  code: string;
  name: string;
  perUnit: number;
  useCount: number;
  packStockQuantity: number;
};
type OtherProject = {
  projectId: string;
  projectName: string;
  planningStart: Date;
  planningEnd: Date;
  bookedQuantity: number;
  effectiveQuantity: number;
  blockingPackUnits: BlockingPack[];
};
type StockInfo = { totalDemand: number; otherProjects: OtherProject[] };

interface Props {
  project: Project & { assignments: AssignmentWithDevice[] };
  allDevices: DeviceLite[];
  conflictMap: Record<string, StockInfo>;
  reservedDeviceIds: string[];
  billingDays: number;
  billingFactor: number;
  subtotal: number;
  discount: number;
  total: number;
  groups: ProjectGroup[];
  categories: Category[];
}

type ConflictPrompt = {
  deviceId: string;
  deviceName: string;
  conflicts: { projectName: string; planningStart: Date; planningEnd: Date }[];
};

export function AssignmentsSection({
  project,
  allDevices,
  conflictMap,
  reservedDeviceIds,
  billingDays,
  billingFactor,
  subtotal,
  discount,
  total,
  groups,
  categories,
}: Props) {
  const reservedSet = new Set(reservedDeviceIds);
  const [pending, startTransition] = useTransition();
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [conflictPrompt, setConflictPrompt] = useState<ConflictPrompt | null>(null);

  // Aktive Gruppe (für neu hinzugefügte Items)
  const [activeGroupId, setActiveGroupId] = useState<string | null>(groups[0]?.id ?? null);
  useEffect(() => {
    if (!activeGroupId && groups[0]) setActiveGroupId(groups[0].id);
    if (activeGroupId && !groups.find((g) => g.id === activeGroupId)) {
      setActiveGroupId(groups[0]?.id ?? null);
    }
  }, [groups, activeGroupId]);

  const [groupDialog, setGroupDialog] = useState<{
    mode: "create" | "rename";
    id?: string;
    name: string;
  } | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<ProjectGroup | null>(null);

  function toggleCat(key: string) {
    setCollapsedCats((prev) => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key);
      else s.add(key);
      return s;
    });
  }

  // Verfügbare Geräte (nicht bereits gebucht)
  const assignedDeviceIds = new Set(project.assignments.map((a) => a.deviceId));
  const availableDevices = allDevices
    .filter((d) => !assignedDeviceIds.has(d.id))
    .filter((d) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        d.name.toLowerCase().includes(q) ||
        (d.manufacturer ?? "").toLowerCase().includes(q) ||
        (d.model ?? "").toLowerCase().includes(q)
      );
    });

  async function handleAdd(deviceId: string, force = false) {
    if (!activeGroupId && groups.length === 0) {
      startTransition(async () => {
        try {
          const res = await createProjectGroup(project.id, {
            name: "Material",
            kind: "MATERIAL",
          });
          if (res?.id) {
            setActiveGroupId(res.id);
            const result = await addAssignment(
              project.id,
              { deviceId, groupId: res.id, quantity: 1 },
              force
            );
            if (!result.ok && result.conflicts) {
              const dev = allDevices.find((p) => p.id === deviceId);
              setConflictPrompt({
                deviceId,
                deviceName: dev?.name ?? "",
                conflicts: result.conflicts,
              });
            }
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Fehler");
        }
      });
      return;
    }
    if (!activeGroupId) return;
    startTransition(async () => {
      try {
        const result = await addAssignment(
          project.id,
          { deviceId, groupId: activeGroupId, quantity: 1 },
          force
        );
        if (!result.ok && result.conflicts) {
          const dev = allDevices.find((p) => p.id === deviceId);
          setConflictPrompt({
            deviceId,
            deviceName: dev?.name ?? "",
            conflicts: result.conflicts,
          });
        } else if (result.ok) {
          toast.success("Gerät gebucht");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleQtyChange(assignmentId: string, q: number) {
    if (q < 1) return;
    startTransition(async () => {
      try {
        await updateAssignmentQuantity(project.id, assignmentId, q);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleRemove(assignmentId: string) {
    startTransition(async () => {
      try {
        await removeAssignment(project.id, assignmentId);
        toast.success("Gerät entfernt");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleMoveToGroup(assignmentId: string, groupId: string) {
    startTransition(async () => {
      try {
        await moveAssignmentToGroup(project.id, assignmentId, groupId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
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
          await createProjectGroup(project.id, {
            name,
            kind: "MATERIAL",
          });
        } else if (groupDialog.id) {
          await renameProjectGroup(groupDialog.id, name);
        }
        setGroupDialog(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleDeleteGroup() {
    if (!deleteGroup) return;
    const id = deleteGroup.id;
    startTransition(async () => {
      try {
        await deleteProjectGroup(id);
        setDeleteGroup(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  // Buchungen pro Gruppe
  const assignmentsByGroup = new Map<string, AssignmentWithDevice[]>();
  for (const a of project.assignments) {
    const arr = assignmentsByGroup.get(a.groupId) ?? [];
    arr.push(a);
    assignmentsByGroup.set(a.groupId, arr);
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button
          size="sm"
          variant="default"
          onClick={() =>
            window.open(
              `/api/projects/${project.id}/packlist.pdf`,
              "_blank"
            )
          }
          disabled={project.assignments.length === 0}
          title={
            project.assignments.length === 0
              ? "Erst Geräte buchen"
              : "Packliste als PDF öffnen"
          }
        >
          <Printer className="h-4 w-4" /> Packliste drucken
        </Button>
      </div>
      <Card className="p-4">
      <HorizontalSplit
        storageKey="devo:material-split"
        defaultLeftPx={360}
        minLeftPx={280}
        minRightPx={520}
        className="lg:min-h-[calc(100vh-380px)] lg:items-stretch"
        left={
          <Card className="border-0 shadow-none lg:h-full flex flex-col">
            <CardHeader className="px-0 pt-0 pb-3 space-y-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" /> Geräte-Katalog
              </CardTitle>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Suchen…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 pl-8"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0 lg:flex-1 lg:overflow-y-auto">
              {availableDevices.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {allDevices.length === 0
                    ? "Noch keine Geräte angelegt"
                    : "Alle passenden bereits gebucht"}
                </p>
              ) : (
                <ul className="divide-y">
                  {groupItemsByCategory(availableDevices, categories).map((catGroup) => {
                    const isCollapsed = collapsedCats.has(catGroup.key);
                    return (
                      <li key={catGroup.key}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-1.5 bg-muted/50 px-3 py-2 text-left text-xs font-semibold hover:bg-muted"
                          onClick={() => toggleCat(catGroup.key)}
                          style={{ paddingLeft: `${0.75 + catGroup.depth * 1.25}rem` }}
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
                          <span className="truncate flex-1">{catGroup.name}</span>
                          <span className="shrink-0 text-muted-foreground font-normal">
                            {catGroup.items.length}
                          </span>
                        </button>
                        {!isCollapsed && (
                          <ul className="divide-y">
                            {catGroup.items.map((d) => {
                              const dailyRate = Number(d.dailyRate);
                              return (
                                <li
                                  key={d.id}
                                  className="group flex items-center gap-2 pl-8 pr-3 py-2 hover:bg-accent/40"
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="truncate text-sm font-medium">
                                      {d.name}
                                    </div>
                                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                                      {(d.manufacturer || d.model) && (
                                        <>
                                          <span className="truncate">
                                            {[d.manufacturer, d.model].filter(Boolean).join(" ")}
                                          </span>
                                          <span>·</span>
                                        </>
                                      )}
                                      <span>Bestand {d.stockQuantity}</span>
                                      <span>·</span>
                                      <span>{formatCurrency(dailyRate)}/T</span>
                                    </div>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0 opacity-60 group-hover:opacity-100"
                                    disabled={pending}
                                    onClick={() => handleAdd(d.id)}
                                    title={
                                      activeGroupId
                                        ? `Zur Gruppe "${groups.find((g) => g.id === activeGroupId)?.name}" hinzufügen`
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
              )}
            </CardContent>
          </Card>
        }
        right={
          <Card className="border-0 shadow-none lg:h-full flex flex-col">
            <CardHeader className="px-0 pt-0 pb-3 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Boxes /> Gebuchte Geräte
                {project.assignments.length > 0 && (
                  <Badge variant="outline">{project.assignments.length} Typen</Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                {groups.length > 0 && (
                  <Select
                    value={activeGroupId ?? ""}
                    onValueChange={(v) => setActiveGroupId(v)}
                  >
                    <SelectTrigger className="w-[200px] h-8 text-xs">
                      <SelectValue placeholder="Aktive Gruppe…" />
                    </SelectTrigger>
                    <SelectContent>
                      {groups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setGroupDialog({ mode: "create", name: "" })
                  }
                >
                  <FolderPlus className="h-4 w-4" /> Neue Gruppe
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 lg:flex-1 lg:overflow-y-auto">
              {groups.length === 0 && (
                <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
                  <p>Noch keine Gruppen — beim ersten Buchen wird automatisch eine angelegt.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => setGroupDialog({ mode: "create", name: "" })}
                  >
                    <FolderPlus className="h-4 w-4" /> Erste Gruppe anlegen
                  </Button>
                </div>
              )}
              {groups.map((g) => {
                const groupAssignments = assignmentsByGroup.get(g.id) ?? [];
                const isActive = activeGroupId === g.id;
                return (
                  <Card
                    key={g.id}
                    className={cn(
                      "mb-4 last:mb-0 transition-shadow cursor-pointer",
                      isActive && "border-primary/60 shadow-md"
                    )}
                    onClick={() => setActiveGroupId(g.id)}
                  >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <CardTitle className="text-base truncate flex items-center gap-2">
                          <Folder className="h-4 w-4 text-muted-foreground" />
                          {g.name}
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
                            setGroupDialog({ mode: "rename", id: g.id, name: g.name });
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
                            setDeleteGroup(g);
                          }}
                          title="Löschen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="pb-3" onClick={(e) => e.stopPropagation()}>
                    {groupAssignments.length === 0 ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">
                        Noch nichts in dieser Gruppe. Klicke ein Gerät aus dem
                        Katalog (Pfeil-Button) — es wird der aktiven Gruppe
                        hinzugefügt.
                      </p>
                    ) : (
                      <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:h-9 [&_th]:px-3">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Gerät</TableHead>
                            <TableHead className="text-right w-[80px]">Anzahl</TableHead>
                            <TableHead className="text-right w-[100px]">€ / Tag</TableHead>
                            <TableHead className="text-right w-[120px]">Summe</TableHead>
                            <TableHead className="w-[100px]">Status</TableHead>
                            <TableHead className="w-[120px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {groupAssignments.map((a) => {
                            const conflict = conflictMap[a.deviceId];
                            const isReserved = reservedSet.has(a.deviceId);
                            // Wenn dieses Projekt für das Gerät als reserviert gilt,
                            // entfällt die Konflikt-Warnung — es hat ja Vorrang.
                            const isOver =
                              !isReserved &&
                              conflict &&
                              conflict.totalDemand > a.device.stockQuantity;
                            const rate = Number(a.device.dailyRate);
                            const lineTotal = rate * a.quantity * billingFactor;
                            return (
                              <Fragment key={a.id}>
                                <TableRow>
                                  <TableCell>
                                    <div className="font-medium">{a.device.name}</div>
                                    {(a.device.manufacturer || a.device.model) && (
                                      <div className="text-[11px] text-muted-foreground">
                                        {[a.device.manufacturer, a.device.model]
                                          .filter(Boolean)
                                          .join(" ")}
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Input
                                      type="number"
                                      min="1"
                                      value={a.quantity}
                                      onChange={(e) =>
                                        handleQtyChange(a.id, Number(e.target.value))
                                      }
                                      disabled={pending}
                                      className={cn(
                                        "h-8 w-16 text-right tabular-nums ml-auto",
                                        isOver && "border-destructive focus-visible:ring-destructive"
                                      )}
                                    />
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums font-mono text-sm">
                                    {formatCurrency(rate)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums font-mono text-sm font-medium">
                                    {formatCurrency(lineTotal)}
                                  </TableCell>
                                  <TableCell>
                                    {isReserved ? (
                                      <span className="text-xs font-medium text-green-600">
                                        gebucht
                                      </span>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center justify-end gap-1">
                                      {groups.length > 1 && (
                                        <Select
                                          value={a.groupId}
                                          onValueChange={(v) => handleMoveToGroup(a.id, v)}
                                        >
                                          <SelectTrigger className="h-7 w-[110px] text-xs">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {groups.map((og) => (
                                              <SelectItem key={og.id} value={og.id}>
                                                {og.name}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      )}
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => handleRemove(a.id)}
                                        disabled={pending}
                                        title="Entfernen"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                                {isOver && (() => {
                                  // Pack-Konflikte: pro Fremdprojekt + FIXED-Pack einen Eintrag
                                  const packConflicts: {
                                    packName: string;
                                    perUnit: number;
                                    useCount: number;
                                    packStockQuantity: number;
                                    projectName: string;
                                  }[] = [];
                                  for (const op of conflict.otherProjects) {
                                    for (const bp of op.blockingPackUnits) {
                                      packConflicts.push({
                                        packName: bp.name,
                                        perUnit: bp.perUnit,
                                        useCount: bp.useCount,
                                        packStockQuantity: bp.packStockQuantity,
                                        projectName: op.projectName,
                                      });
                                    }
                                  }
                                  return (
                                    <TableRow className="bg-destructive/5">
                                      <TableCell colSpan={6} className="text-xs text-destructive">
                                        <div className="flex items-start gap-1.5">
                                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                                          <div className="space-y-1">
                                            <div className="font-medium">
                                              Konflikt: {conflict.totalDemand} von {a.device.stockQuantity} Stück physischen Geräten zugewiesen.
                                            </div>
                                            {packConflicts.length > 0 && (
                                              <ul className="list-disc list-inside space-y-0.5">
                                                {packConflicts.map((pc, i) => (
                                                  <li key={i}>
                                                    {pc.useCount} von {pc.packStockQuantity}{" "}
                                                    <span className="font-medium">
                                                      „{pc.packName} (enthält jeweils {pc.perUnit} Geräte)"
                                                    </span>{" "}
                                                    Packeinheiten bereits in{" "}
                                                    <span className="font-medium">
                                                      {pc.projectName}
                                                    </span>{" "}
                                                    belegt.
                                                  </li>
                                                ))}
                                              </ul>
                                            )}
                                          </div>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })()}
                              </Fragment>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                    </CardContent>
                  </Card>
                );
              })}

              {project.assignments.length > 0 && (
                <div className="mt-4 border-t pt-3 px-2 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Zwischensumme</span>
                    <span className="tabular-nums font-mono">{formatCurrency(subtotal)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Rabatte</span>
                      <span className="tabular-nums font-mono">
                        −{formatCurrency(discount)}
                      </span>
                    </div>
                  )}
                  <div className="mt-1 flex justify-between font-semibold">
                    <span>Material gesamt</span>
                    <span className="tabular-nums font-mono">{formatCurrency(total)}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {billingDays} Tag(e) · Mietfaktor ×{billingFactor.toFixed(2)}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        }
      />

      {/* Gruppe-Dialog */}
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
              Gruppen sind nur für dieses Projekt — z.B. „Ton", „Licht", „Bühne".
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveGroup();
            }}
            className="space-y-3"
          >
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={groupDialog?.name ?? ""}
                onChange={(e) =>
                  setGroupDialog((g) =>
                    g ? { ...g, name: e.target.value } : g
                  )
                }
                autoFocus
                required
              />
            </div>
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

      <ConfirmDialog
        open={deleteGroup !== null}
        onOpenChange={(o) => !o && setDeleteGroup(null)}
        title="Gruppe löschen?"
        description={
          deleteGroup && (
            <>
              Die Gruppe <strong>{deleteGroup.name}</strong> wird gelöscht.
              Enthaltene Buchungen werden in die nächste verbleibende Gruppe verschoben.
            </>
          )
        }
        confirmLabel="Löschen"
        pending={pending}
        onConfirm={handleDeleteGroup}
      />
      </Card>

      <ConfirmDialog
        open={conflictPrompt !== null}
        onOpenChange={(o) => !o && setConflictPrompt(null)}
        title="Gerät bereits in anderen Projekten gebucht"
        description={
          conflictPrompt && (
            <>
              <div className="mb-2">
                <strong>{conflictPrompt.deviceName}</strong> ist in folgenden
                überlappenden Projekten gebucht:
              </div>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {conflictPrompt.conflicts.map((c, i) => (
                  <li key={i}>
                    {c.projectName}
                  </li>
                ))}
              </ul>
              <div className="mt-2 text-xs text-muted-foreground">
                Trotzdem buchen? Die Verfügbarkeit wird über die Bestandsmenge
                geprüft, sodass mehrere Projekte das Gerät teilen können.
              </div>
            </>
          )
        }
        confirmLabel="Trotzdem buchen"
        pending={pending}
        onConfirm={() => {
          if (conflictPrompt) {
            handleAdd(conflictPrompt.deviceId, true);
            setConflictPrompt(null);
          }
        }}
      />
    </>
  );
}
