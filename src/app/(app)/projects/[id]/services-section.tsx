"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowRight,
  Plus,
  Search,
  Trash2,
  X,
  FolderPlus,
  Pencil,
  Loader2,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Users,
  Truck,
  Package,
  MessageSquarePlus,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { SortableRow, DragHandleCell } from "@/components/ui/sortable-row";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  reorderGroupItems,
  addGroupComment,
  updateGroupComment,
  deleteGroupComment,
} from "./group-items-actions";

/** Icon je ServiceItemKind */
function kindIcon(kind: ServiceItemKind) {
  if (kind === "PERSONAL") return Users;
  if (kind === "TRANSPORT") return Truck;
  return Package;
}
import { toast } from "sonner";
import { ServiceItemDialog, ServiceItemVM } from "../../services/service-dialog";
import {
  addProjectService,
  removeProjectService,
  updateProjectService,
  moveProjectServiceToGroup,
} from "./services-actions";
import {
  createProjectGroup,
  updateProjectGroup,
  deleteProjectGroup,
} from "./groups-actions";
import {
  billingUnitLabel,
  billingUnitShort,
  serviceItemKindLabel,
} from "@/lib/labels";
import { cn, formatCurrency } from "@/lib/utils";
import { BillingUnit, ServiceItemKind } from "@prisma/client";
import type { ProjectGroup, ProjectGroupComment } from "@prisma/client";
import { HorizontalSplit } from "@/components/ui/horizontal-split";

export interface ProjectServiceVM {
  id: string;
  serviceItemId: string;
  groupId: string;
  quantity: number;
  unitPriceOverride: number | null;
  notes: string | null;
  serviceItem: {
    id: string;
    name: string;
    kind: ServiceItemKind;
    unit: BillingUnit;
    unitPrice: number;
    active: boolean;
  };
}

export function ServicesSection({
  projectId,
  projectServices,
  catalog,
  groups,
  groupComments,
}: {
  projectId: string;
  projectServices: ProjectServiceVM[];
  catalog: ServiceItemVM[];
  groups: ProjectGroup[];
  groupComments: ProjectGroupComment[];
}) {
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [collapsedKinds, setCollapsedKinds] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<ProjectServiceVM | null>(null);

  // Aktive Gruppe
  const [activeGroupId, setActiveGroupId] = useState<string | null>(
    groups[0]?.id ?? null
  );
  useEffect(() => {
    if (!activeGroupId && groups[0]) setActiveGroupId(groups[0].id);
    if (activeGroupId && !groups.find((g) => g.id === activeGroupId)) {
      setActiveGroupId(groups[0]?.id ?? null);
    }
  }, [groups, activeGroupId]);

  // Gruppen-Dialoge
  const [groupDialog, setGroupDialog] = useState<{
    mode: "create" | "rename";
    id?: string;
    name: string;
    billable: boolean;
  } | null>(null);
  const [deleteGroupPrompt, setDeleteGroupPrompt] = useState<ProjectGroup | null>(null);

  // DnD + Comments
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const commentsByGroup = useMemo(() => {
    const map = new Map<string, ProjectGroupComment[]>();
    for (const c of groupComments) {
      const arr = map.get(c.groupId) ?? [];
      arr.push(c);
      map.set(c.groupId, arr);
    }
    return map;
  }, [groupComments]);
  const [commentDialog, setCommentDialog] = useState<{
    mode: "create" | "edit";
    id?: string;
    groupId: string;
    text: string;
  } | null>(null);
  const [commentDelete, setCommentDelete] = useState<ProjectGroupComment | null>(null);

  type ServiceRow = {
    sortId: string;
    kind: "SERVICE" | "COMMENT";
    id: string;
    sortOrder: number;
  };
  function buildServiceGroupRows(groupId: string): ServiceRow[] {
    const out: ServiceRow[] = [];
    for (const ps of projectServices) {
      if (ps.groupId !== groupId) continue;
      out.push({
        sortId: `SERVICE:${ps.id}`,
        kind: "SERVICE",
        id: ps.id,
        sortOrder: (ps as unknown as { sortOrder?: number }).sortOrder ?? 0,
      });
    }
    for (const c of commentsByGroup.get(groupId) ?? []) {
      out.push({
        sortId: `COMMENT:${c.id}`,
        kind: "COMMENT",
        id: c.id,
        sortOrder: c.sortOrder,
      });
    }
    return out.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  function handleDragEnd(rows: ServiceRow[], e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const oldIdx = rows.findIndex((r) => r.sortId === e.active.id);
    const newIdx = rows.findIndex((r) => r.sortId === e.over!.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const ordered = arrayMove(rows, oldIdx, newIdx);
    startTransition(async () => {
      try {
        await reorderGroupItems(
          projectId,
          ordered.map((r) => ({ kind: r.kind, id: r.id }))
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler beim Sortieren");
      }
    });
  }

  function handleSaveComment() {
    if (!commentDialog) return;
    const text = commentDialog.text.trim();
    if (!text) {
      toast.error("Text darf nicht leer sein");
      return;
    }
    startTransition(async () => {
      try {
        if (commentDialog.mode === "create") {
          await addGroupComment(projectId, commentDialog.groupId, text);
          toast.success("Kommentar hinzugefügt");
        } else if (commentDialog.id) {
          await updateGroupComment(commentDialog.id, text);
          toast.success("Kommentar gespeichert");
        }
        setCommentDialog(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }
  function handleDeleteComment() {
    if (!commentDelete) return;
    const id = commentDelete.id;
    startTransition(async () => {
      try {
        await deleteGroupComment(id);
        setCommentDelete(null);
        toast.success("Kommentar entfernt");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  const [extraItems, setExtraItems] = useState<ServiceItemVM[]>([]);

  const fullCatalog = useMemo(() => {
    const map = new Map<string, ServiceItemVM>();
    [...catalog, ...extraItems].forEach((c) => map.set(c.id, c));
    return Array.from(map.values());
  }, [catalog, extraItems]);

  // Bereits im Projekt gebuchte Service-Items bleiben sichtbar — derselbe
  // Service kann bewusst mehrfach gebucht werden (z.B. eine Position pro
  // Gruppe).
  const availableFromFullCatalog = useMemo(() => {
    return fullCatalog.filter((c) => {
      if (!c.active) return false;
      if (kindFilter !== "all" && c.kind !== kindFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [fullCatalog, kindFilter, search]);

  async function handleAdd(serviceItemId: string) {
    let groupId = activeGroupId;
    if (!groupId) {
      try {
        const res = await createProjectGroup(projectId, {
          name: "Allgemein",
          kind: "SERVICE",
        });
        groupId = res.id;
        setActiveGroupId(groupId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler beim Anlegen der Gruppe");
        return;
      }
    }
    const gid = groupId;
    startTransition(async () => {
      try {
        await addProjectService(projectId, {
          serviceItemId,
          groupId: gid,
          quantity: 1,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler beim Hinzufügen");
      }
    });
  }

  function handleQty(ps: ProjectServiceVM, value: string) {
    const q = Number(value);
    if (!isFinite(q) || q < 0) return;
    startTransition(async () => {
      try {
        await updateProjectService(ps.id, { quantity: q });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleOverride(ps: ProjectServiceVM, value: string) {
    const trimmed = value.trim();
    const newVal = trimmed === "" ? null : Number(trimmed);
    if (newVal !== null && (!isFinite(newVal) || newVal < 0)) return;
    startTransition(async () => {
      try {
        await updateProjectService(ps.id, { unitPriceOverride: newVal });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleMoveToGroup(serviceId: string, groupId: string) {
    startTransition(async () => {
      try {
        await moveProjectServiceToGroup(serviceId, groupId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleRemove() {
    if (!confirmRemove) return;
    const id = confirmRemove.id;
    startTransition(async () => {
      try {
        await removeProjectService(id);
        toast.success("Position entfernt");
        setConfirmRemove(null);
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
          const res = await createProjectGroup(projectId, {
            name,
            kind: "SERVICE",
            billable: groupDialog.billable,
          });
          setActiveGroupId(res.id);
          toast.success("Gruppe angelegt");
        } else if (groupDialog.id) {
          await updateProjectGroup(groupDialog.id, {
            name,
            billable: groupDialog.billable,
          });
          toast.success("Gruppe gespeichert");
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
            ? "Gruppe gelöscht — Positionen verschoben"
            : "Gruppe inkl. Positionen gelöscht"
        );
        setDeleteGroupPrompt(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  // Services nach Gruppe gruppieren
  const servicesByGroup = new Map<string, ProjectServiceVM[]>();
  for (const ps of projectServices) {
    const arr = servicesByGroup.get(ps.groupId) ?? [];
    arr.push(ps);
    servicesByGroup.set(ps.groupId, arr);
  }

  const subtotal = projectServices.reduce(
    (sum, p) =>
      sum + p.quantity * (p.unitPriceOverride ?? p.serviceItem.unitPrice),
    0
  );

  /** Rendert eine sortierbare Service-Zeile (Personal/Transport). */
  function renderServiceRow(ps: ProjectServiceVM, sortId: string) {
    const otherGroups = groups.filter((g) => g.id !== ps.groupId);
    const effectivePrice = ps.unitPriceOverride ?? ps.serviceItem.unitPrice;
    const line = ps.quantity * effectivePrice;
    const hasOverride = ps.unitPriceOverride !== null;
    const KindIcon = kindIcon(ps.serviceItem.kind);
    return (
      <SortableRow id={sortId} key={sortId} className="[&_td]:px-2 [&_td]:py-1">
        <DragHandleCell />
        <TableCell>
          {/* Name nur einzeilig — Einheit/Art wandern in eigene Spalte */}
          <div className="flex items-center gap-2 font-medium truncate">
            <KindIcon
              className="h-4 w-4 text-muted-foreground shrink-0"
              aria-label={serviceItemKindLabel(ps.serviceItem.kind)}
            />
            <span className="truncate">{ps.serviceItem.name}</span>
          </div>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {billingUnitLabel(ps.serviceItem.unit)}
        </TableCell>
        <TableCell className="text-right">
          <Input
            type="number"
            step="0.5"
            min="0"
            defaultValue={ps.quantity}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (v !== ps.quantity) handleQty(ps, e.target.value);
            }}
            className="h-7 text-right"
          />
        </TableCell>
        <TableCell className="text-right">
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder={ps.serviceItem.unitPrice.toFixed(2)}
            defaultValue={
              ps.unitPriceOverride === null ? "" : String(ps.unitPriceOverride)
            }
            onBlur={(e) => {
              const raw = e.target.value;
              const newVal = raw.trim() === "" ? null : Number(raw);
              if (newVal !== ps.unitPriceOverride) {
                handleOverride(ps, raw);
              }
            }}
            className={"h-7 text-right " + (hasOverride ? "border-amber-500" : "")}
            title={
              hasOverride
                ? `Katalogpreis: ${formatCurrency(ps.serviceItem.unitPrice)}`
                : "Leer = Katalogpreis"
            }
          />
        </TableCell>
        <TableCell className="text-right tabular-nums font-mono text-sm font-medium">
          {formatCurrency(line)}
        </TableCell>
        <TableCell>
          <div className="flex gap-0.5">
            {otherGroups.length > 0 && (
              <Select
                value=""
                onValueChange={(v) => handleMoveToGroup(ps.id, v)}
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
              onClick={() => setConfirmRemove(ps)}
              disabled={pending}
              title="Entfernen"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TableCell>
      </SortableRow>
    );
  }

  return (
    <>
      <Card className="p-4">
      <HorizontalSplit
        storageKey="devo:services-split"
        defaultLeftPx={360}
        minLeftPx={280}
        minRightPx={520}
        className="lg:items-start"
        leftClassName="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)]"
        left={
          <Card className="border-0 shadow-none flex flex-col lg:h-[calc(100vh-2rem)]">
            <CardHeader className="px-0 pt-0 pb-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Truck className="h-4 w-4" /> Personal &amp; Transport
                </CardTitle>
                <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4" /> Neue Position
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Suche…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-9 pl-8"
                  />
                </div>
                <Select value={kindFilter} onValueChange={setKindFilter}>
                  <SelectTrigger className="h-9 w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Arten</SelectItem>
                    {Object.values(ServiceItemKind).map((k) => (
                      <SelectItem key={k} value={k}>
                        {serviceItemKindLabel(k)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(search || kindFilter !== "all") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setKindFilter("all");
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {groups.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground shrink-0">
                    Hinzufügen zu:
                  </span>
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
                {/* Mini-Tabellen-Header — Position links, Einheit (h/Std/Tag)
                    rechts neben dem Namen. */}
                <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  <span className="flex-1">Position</span>
                  <span className="w-12 text-right">Einheit</span>
                  <span className="w-7" />
                </div>
                {availableFromFullCatalog.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                    {search || kindFilter !== "all"
                      ? "Keine passenden Positionen"
                      : "Noch keine aktiven Positionen — über „Neue Position“ kannst du eine anlegen."}
                  </p>
                ) : (
                  (() => {
                    // Gruppieren nach kind (PERSONAL/TRANSPORT/SONSTIGES)
                    const byKind = new Map<string, ServiceItemVM[]>();
                    for (const s of availableFromFullCatalog) {
                      const arr = byKind.get(s.kind) ?? [];
                      arr.push(s);
                      byKind.set(s.kind, arr);
                    }
                    // Reihenfolge fest: PERSONAL, TRANSPORT, SONSTIGES
                    const order = Object.values(ServiceItemKind);
                    return (
                      <ul className="divide-y">
                        {order
                          .filter((k) => byKind.has(k))
                          .map((kind) => {
                            const items = byKind.get(kind) ?? [];
                            const isCollapsed = collapsedKinds.has(kind);
                            return (
                              <li key={kind}>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-1.5 bg-muted/50 px-3 py-2 text-left text-xs font-semibold hover:bg-muted"
                                  onClick={() => {
                                    const s = new Set(collapsedKinds);
                                    if (s.has(kind)) s.delete(kind);
                                    else s.add(kind);
                                    setCollapsedKinds(s);
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
                                  <span className="truncate flex-1">
                                    {serviceItemKindLabel(kind)}
                                  </span>
                                  <span className="shrink-0 text-muted-foreground font-normal">
                                    {items.length}
                                  </span>
                                </button>
                                {!isCollapsed && (
                                  <ul className="divide-y">
                                    {items.map((s) => (
                                      <li
                                        key={s.id}
                                        className="group flex items-center gap-2 pl-6 pr-2 py-1 hover:bg-accent/40"
                                      >
                                        {/* Kompakte Katalog-Zeile — nur Name,
                                            keine Preis-/Einheit-Sub-Zeile mehr. */}
                                        <div className="flex-1 min-w-0">
                                          <div className="truncate text-sm font-medium">
                                            {s.name}
                                          </div>
                                        </div>
                                        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                                          {billingUnitShort(s.unit)}
                                        </span>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 shrink-0 opacity-60 group-hover:opacity-100"
                                          disabled={pending}
                                          onClick={() => handleAdd(s.id)}
                                          title={
                                            activeGroupId
                                              ? `Zur Gruppe „${groups.find((g) => g.id === activeGroupId)?.name}“ hinzufügen`
                                              : "Eine Standardgruppe wird automatisch angelegt"
                                          }
                                        >
                                          <ArrowRight className="h-4 w-4" />
                                        </Button>
                                      </li>
                                    ))}
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
              <CardTitle className="text-base flex items-center gap-2">
                <FolderOpen className="h-4 w-4" /> Zugewiesen
                {projectServices.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {projectServices.length}{" "}
                    {projectServices.length === 1 ? "Position" : "Positionen"}
                  </Badge>
                )}
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setGroupDialog({ mode: "create", name: "", billable: true })}
              >
                <FolderPlus className="h-4 w-4" /> Gruppe anlegen
              </Button>
            </div>

            {groups.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
                  <FolderPlus className="h-8 w-8 opacity-30" />
                  <p className="text-sm">
                    Lege eine Gruppe an (z.B. „Aufbau", „Eventtag", „Abbau"), um
                    Personal- und Transport-Positionen zuzuordnen.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setGroupDialog({ mode: "create", name: "", billable: true })}
                  >
                    <FolderPlus className="h-4 w-4" /> Erste Gruppe anlegen
                  </Button>
                </CardContent>
              </Card>
            ) : (
              groups.map((group) => {
                const groupItems = servicesByGroup.get(group.id) ?? [];
                const groupSubtotal = groupItems.reduce(
                  (sum, ps) =>
                    sum +
                    ps.quantity *
                      (ps.unitPriceOverride ?? ps.serviceItem.unitPrice),
                  0
                );
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
                          {groupItems.length}
                        </Badge>
                        {!group.billable && (
                          <Badge variant="warning" className="text-[10px]">
                            nicht abrechenbar
                          </Badge>
                        )}
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
                            setCommentDialog({
                              mode: "create",
                              groupId: group.id,
                              text: "",
                            });
                          }}
                          title="Kommentar hinzufügen"
                        >
                          <MessageSquarePlus className="h-3.5 w-3.5" />
                        </Button>
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
                              billable: group.billable,
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
                      {(() => {
                        const serviceRows = buildServiceGroupRows(group.id);
                        if (serviceRows.length === 0) {
                          return (
                            <p className="py-4 text-center text-xs text-muted-foreground">
                              Noch nichts in dieser Gruppe. Wähle eine Position aus dem
                              Katalog (Pfeil-Button) — sie wird der aktiven Gruppe
                              hinzugefügt.
                            </p>
                          );
                        }
                        return (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(e) => handleDragEnd(serviceRows, e)}
                        >
                        <Table className="[&_td]:py-1 [&_td]:px-2 [&_th]:h-8 [&_th]:px-2">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-6"></TableHead>
                              <TableHead className="px-2">Position</TableHead>
                              <TableHead className="px-2 w-[120px]">Einheit</TableHead>
                              <TableHead className="w-[90px] text-right px-2">Menge</TableHead>
                              <TableHead className="w-[120px] text-right px-2">€ / Einheit</TableHead>
                              <TableHead className="w-[100px] text-right px-2">Summe</TableHead>
                              <TableHead className="w-[80px] px-2"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                          <SortableContext
                            items={serviceRows.map((r) => r.sortId)}
                            strategy={verticalListSortingStrategy}
                          >
                          {serviceRows.map((r) => {
                            if (r.kind === "COMMENT") {
                              const c = (commentsByGroup.get(group.id) ?? []).find(
                                (x) => x.id === r.id
                              );
                              if (!c) return null;
                              return (
                                <SortableRow
                                  id={r.sortId}
                                  key={r.sortId}
                                  className="bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-950/60 border-t-2 border-blue-200 dark:border-blue-900/50"
                                >
                                  <DragHandleCell />
                                  <TableCell colSpan={5} className="py-3 text-base font-semibold text-foreground">
                                    {c.text}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center justify-end gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() =>
                                          setCommentDialog({
                                            mode: "edit",
                                            id: c.id,
                                            groupId: c.groupId,
                                            text: c.text,
                                          })
                                        }
                                        title="Bearbeiten"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-destructive hover:text-destructive"
                                        onClick={() => setCommentDelete(c)}
                                        disabled={pending}
                                        title="Entfernen"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </SortableRow>
                              );
                            }
                            const ps = groupItems.find((x) => x.id === r.id);
                            if (!ps) return null;
                            return renderServiceRow(ps, r.sortId);
                          })}
                          </SortableContext>
                          <TableRow>
                            <TableCell colSpan={5} className="text-right font-medium">
                              Gruppen-Zwischensumme
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-mono text-sm font-medium">
                              {formatCurrency(groupSubtotal)}
                            </TableCell>
                            <TableCell />
                          </TableRow>
                          </TableBody>
                        </Table>
                        </DndContext>
                        );
                      })()}

                      {false && (
                        <Table>
                          <TableBody>
                            {groupItems.map((ps) => {
                              const effectivePrice =
                                ps.unitPriceOverride ?? ps.serviceItem.unitPrice;
                              const line = ps.quantity * effectivePrice;
                              const hasOverride = ps.unitPriceOverride !== null;
                              const KindIcon = kindIcon(ps.serviceItem.kind);
                              return (
                                <TableRow key={ps.id}>
                                  <TableCell>
                                    <div className="flex items-center gap-2 font-medium">
                                      <KindIcon
                                        className="h-4 w-4 text-muted-foreground"
                                        aria-label={serviceItemKindLabel(
                                          ps.serviceItem.kind
                                        )}
                                      />
                                      {ps.serviceItem.name}
                                    </div>
                                    <div className="ml-6 text-[11px] text-muted-foreground">
                                      {billingUnitLabel(ps.serviceItem.unit)}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Input
                                      type="number"
                                      step="0.5"
                                      min="0"
                                      defaultValue={ps.quantity}
                                      onBlur={(e) => {
                                        const v = Number(e.target.value);
                                        if (v !== ps.quantity)
                                          handleQty(ps, e.target.value);
                                      }}
                                      className="h-8 text-right"
                                    />
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      placeholder={ps.serviceItem.unitPrice.toFixed(2)}
                                      defaultValue={
                                        ps.unitPriceOverride === null
                                          ? ""
                                          : String(ps.unitPriceOverride)
                                      }
                                      onBlur={(e) => {
                                        const raw = e.target.value;
                                        const newVal =
                                          raw.trim() === "" ? null : Number(raw);
                                        if (newVal !== ps.unitPriceOverride) {
                                          handleOverride(ps, raw);
                                        }
                                      }}
                                      className={
                                        "h-8 text-right " +
                                        (hasOverride ? "border-amber-500" : "")
                                      }
                                      title={
                                        hasOverride
                                          ? `Katalogpreis: ${formatCurrency(ps.serviceItem.unitPrice)}`
                                          : "Leer = Katalogpreis"
                                      }
                                    />
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums font-mono text-sm font-medium">
                                    {formatCurrency(line)}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex gap-0.5">
                                      {otherGroups.length > 0 && (
                                        <Select
                                          value=""
                                          onValueChange={(v) =>
                                            handleMoveToGroup(ps.id, v)
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
                                        onClick={() => setConfirmRemove(ps)}
                                        disabled={pending}
                                        title="Entfernen"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                            <TableRow>
                              <TableCell colSpan={3} className="text-right font-medium">
                                Gruppen-Zwischensumme
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-mono text-sm font-medium">
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

            {projectServices.length > 0 && (
              <Card>
                <CardContent className="py-3 space-y-1 text-sm">
                  <div className="flex justify-between font-bold">
                    <span>Personal- &amp; Transport-Summe</span>
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
      </Card>

      <ServiceItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(created) => {
          setExtraItems((prev) => [...prev, created]);
          handleAdd(created.id);
        }}
      />

      <Dialog
        open={confirmRemove !== null}
        onOpenChange={(o) => !o && setConfirmRemove(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Position entfernen?
            </DialogTitle>
            <DialogDescription>
              {confirmRemove && (
                <>
                  <strong>{confirmRemove.serviceItem.name}</strong> wird aus diesem
                  Projekt entfernt. Der Katalog-Eintrag bleibt unverändert.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmRemove(null)}
              disabled={pending}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={pending}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Entfernen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gruppen-Edit-Dialog */}
      <Dialog
        open={groupDialog !== null}
        onOpenChange={(o) => !o && setGroupDialog(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {groupDialog?.mode === "create" ? "Gruppe anlegen" : "Gruppe bearbeiten"}
            </DialogTitle>
            <DialogDescription>
              Gruppen sind nur für dieses Projekt — z.B. „Aufbau", „Eventtag",
              „Abbau".
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
              <Label htmlFor="group-name">Name</Label>
              <Input
                id="group-name"
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
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={groupDialog?.billable ?? true}
                onChange={(e) =>
                  setGroupDialog((g) =>
                    g ? { ...g, billable: e.target.checked } : g
                  )
                }
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              <span>
                <span className="font-medium">Abrechenbar</span>
                <span className="block text-xs text-muted-foreground">
                  Wenn deaktiviert, taucht diese Gruppe nicht auf Angeboten oder
                  Rechnungen auf und fließt nicht in Gesamtsummen ein.
                </span>
              </span>
            </label>
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
                {groupDialog?.mode === "create" ? "Anlegen" : "Speichern"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Kommentar-Dialog */}
      <Dialog
        open={commentDialog !== null}
        onOpenChange={(o) => !o && setCommentDialog(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {commentDialog?.mode === "create"
                ? "Kommentar hinzufügen"
                : "Kommentar bearbeiten"}
            </DialogTitle>
            <DialogDescription>
              Freier Text als Zwischenüberschrift in der Service-Tabelle.
              Erscheint auch auf Angeboten und Rechnungen.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveComment();
            }}
            className="space-y-3"
          >
            <Textarea
              value={commentDialog?.text ?? ""}
              onChange={(e) =>
                setCommentDialog((d) => (d ? { ...d, text: e.target.value } : d))
              }
              rows={3}
              autoFocus
              required
              placeholder="z.B. Zwischenüberschrift, Hinweis, Erläuterung…"
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCommentDialog(null)}
                disabled={pending}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {commentDialog?.mode === "create" ? "Hinzufügen" : "Speichern"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={commentDelete !== null}
        onOpenChange={(o) => !o && setCommentDelete(null)}
        title="Kommentar entfernen?"
        description={commentDelete && <>„{commentDelete.text}" wird entfernt.</>}
        confirmLabel="Entfernen"
        pending={pending}
        onConfirm={handleDeleteComment}
      />
    </>
  );
}
