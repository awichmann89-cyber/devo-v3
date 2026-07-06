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
import { Textarea } from "@/components/ui/textarea";
import { QuantityInput } from "@/components/ui/quantity-input";
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
  Download,
} from "lucide-react";
import {
  addAssignment,
  removeAssignment,
  updateAssignmentQuantity,
  moveAssignmentToGroup,
} from "../actions";
import {
  createProjectGroup,
  updateProjectGroup,
  deleteProjectGroup,
} from "./groups-actions";
import { ScanDialog } from "./scan-dialog";
import { toast } from "sonner";
import { cn, formatCurrency } from "@/lib/utils";
import { HorizontalSplit } from "@/components/ui/horizontal-split";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { groupItemsByCategory } from "@/lib/category-tree";
import type {
  Project,
  ProjectAssignment,
  ProjectCableAssignment,
  Device,
  Cable,
  Category,
  ProjectGroup,
} from "@prisma/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Cable as CableIcon } from "lucide-react";
import {
  addCableAssignment,
  removeCableAssignment,
  updateCableAssignmentQuantity,
  moveCableAssignmentToGroup,
  ensureDefaultCableGroup,
} from "../cable-actions";
import {
  addAdHocItem,
  updateAdHocItem,
  deleteAdHocItem,
} from "./adhoc-actions";
import {
  reorderGroupItems,
  addGroupComment,
  updateGroupComment,
  deleteGroupComment,
  type GroupItemKind,
} from "./group-items-actions";
import type { ProjectAdHocItem, ProjectGroupComment } from "@prisma/client";
import { Plus, MessageSquarePlus, HandCoins } from "lucide-react";
import {
  SubhireDialog,
  emptySubhire,
  type SubhireFormValue,
} from "./subhire-dialog";
import { removeSubhire } from "./costs-actions";
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

type DeviceLite = Device & { category: Category | null };
type CableLite = Cable & { category: Category | null };
type AssignmentWithDevice = ProjectAssignment & { device: DeviceLite };
type CableAssignmentWithCable = ProjectCableAssignment & { cable: CableLite };

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
type StockInfo = {
  totalDemand: number;
  otherProjects: OtherProject[];
  ownBookedQuantity: number;
  ownEffectiveQuantity: number;
  ownBlockingPackUnits: BlockingPack[];
};

type CableConflictInfo = {
  stock: number;
  packAllocation: number;
  foreignBookings: { projectName: string; quantity: number }[];
  foreignTotal: number;
};

interface Props {
  project: Project & { assignments: AssignmentWithDevice[] };
  allDevices: DeviceLite[];
  allCables: CableLite[];
  cableAssignments: CableAssignmentWithCable[];
  cableConflictMap: Record<string, CableConflictInfo>;
  conflictMap: Record<string, StockInfo>;
  reservedDeviceIds: string[];
  billingDays: number;
  billingFactor: number;
  subtotal: number;
  discount: number;
  total: number;
  groups: ProjectGroup[];
  cableGroups: ProjectGroup[];
  adHocItems: ProjectAdHocItem[];
  groupComments: ProjectGroupComment[];
  categories: Category[];
  scanProgress: { packed: number; total: number };
  /** Verkauf-Modus: Tagesfaktor ist 1, „€/Tag" wird zu „€/Stück", Faktor-Spalte entfällt. */
  isSale: boolean;
  /**
   * Zumietungen (rein interne Kostenpositionen). Verknüpfte (deviceId gesetzt)
   * markieren die Geräte-Zeile blau; freie (nur groupId) erscheinen als eigene
   * blaue Zeile in ihrer Gruppe. Beeinflussen Planung/Preise NICHT.
   */
  subhires: SubhireVM[];
}

export interface SubhireVM {
  id: string;
  deviceId: string | null;
  groupId: string | null;
  name: string;
  supplier: string | null;
  quantity: number;
  unitCost: number;
}

type ConflictPrompt = {
  deviceId: string;
  deviceName: string;
  conflicts: { projectName: string; planningStart: Date; planningEnd: Date }[];
};

export function AssignmentsSection({
  project,
  allDevices,
  allCables,
  cableAssignments,
  cableConflictMap,
  conflictMap,
  reservedDeviceIds,
  billingDays,
  billingFactor,
  subtotal,
  discount,
  total,
  groups,
  cableGroups,
  adHocItems,
  groupComments,
  categories,
  scanProgress,
  isSale,
  subhires,
}: Props) {
  const reservedSet = new Set(reservedDeviceIds);
  const [pending, startTransition] = useTransition();

  // ----- Zumietungen -----
  // Verknüpfte Zumietungen: Menge je Gerät (markiert die Geräte-Zeile blau).
  const subhireQtyByDevice = new Map<string, number>();
  // Freie Zumietungen (nur Gruppe, kein Gerät): eigene blaue Zeile in der Gruppe.
  const freeSubhiresByGroup = new Map<string, SubhireVM[]>();
  for (const s of subhires) {
    if (s.deviceId) {
      subhireQtyByDevice.set(
        s.deviceId,
        (subhireQtyByDevice.get(s.deviceId) ?? 0) + s.quantity
      );
    } else if (s.groupId) {
      const arr = freeSubhiresByGroup.get(s.groupId) ?? [];
      arr.push(s);
      freeSubhiresByGroup.set(s.groupId, arr);
    }
  }
  // Dialog-State für „Zumieten" direkt aus dem Material-Tab.
  const [subhireDialog, setSubhireDialog] = useState<SubhireFormValue | null>(null);
  const [subhireDelete, setSubhireDelete] = useState<SubhireVM | null>(null);
  const materialGroupOptions = groups.map((g) => ({ id: g.id, name: g.name }));
  const deviceOptions = allDevices.map((d) => ({
    id: d.id,
    name: d.name,
    manufacturer: d.manufacturer,
    model: d.model,
  }));

  function handleDeleteSubhire() {
    if (!subhireDelete) return;
    const id = subhireDelete.id;
    startTransition(async () => {
      try {
        await removeSubhire(id);
        toast.success("Zumietung entfernt");
        setSubhireDelete(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [conflictPrompt, setConflictPrompt] = useState<ConflictPrompt | null>(null);

  // Aktive Gruppe (für neu hinzugefügte Items) — Geräte
  const [activeGroupId, setActiveGroupId] = useState<string | null>(groups[0]?.id ?? null);
  useEffect(() => {
    if (!activeGroupId && groups[0]) setActiveGroupId(groups[0].id);
    if (activeGroupId && !groups.find((g) => g.id === activeGroupId)) {
      setActiveGroupId(groups[0]?.id ?? null);
    }
  }, [groups, activeGroupId]);

  // Aktive Gruppe für Kabel — eigener State, da CABLE-Gruppen separat sind
  const [activeCableGroupId, setActiveCableGroupId] = useState<string | null>(
    cableGroups[0]?.id ?? null
  );
  useEffect(() => {
    if (!activeCableGroupId && cableGroups[0]) setActiveCableGroupId(cableGroups[0].id);
    if (activeCableGroupId && !cableGroups.find((g) => g.id === activeCableGroupId)) {
      setActiveCableGroupId(cableGroups[0]?.id ?? null);
    }
  }, [cableGroups, activeCableGroupId]);

  // Group-Dialog wird für beide Tabs verwendet — kind sagt, wofür angelegt werden soll
  const [groupDialog, setGroupDialog] = useState<{
    mode: "create" | "rename";
    id?: string;
    name: string;
    billable: boolean;
    kind: "MATERIAL" | "CABLE";
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

  // Gebuchte Menge pro Gerät in DIESEM Projekt. Wird unten verwendet, um
  // den verbleibenden Bestand in der Katalog-Spalte anzuzeigen — gebuchte
  // Geräte bleiben sichtbar, ihr Bestand-Wert sinkt aber entsprechend.
  const bookedQtyByDevice = new Map<string, number>();
  for (const a of project.assignments) {
    bookedQtyByDevice.set(
      a.deviceId,
      (bookedQtyByDevice.get(a.deviceId) ?? 0) + a.quantity,
    );
  }
  const availableDevices = allDevices.filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      (d.manufacturer ?? "").toLowerCase().includes(q) ||
      (d.model ?? "").toLowerCase().includes(q) ||
      (d.description ?? "").toLowerCase().includes(q)
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

  // ----- Kabel-Buchungen -----
  const [cableSearch, setCableSearch] = useState("");
  // Gebuchte Menge pro Kabel in DIESEM Projekt. Analog zur Geräte-Logik:
  // gebuchte Kabel bleiben im Katalog sichtbar, nur der freie Bestand sinkt.
  const bookedQtyByCable = new Map<string, number>();
  for (const ca of cableAssignments) {
    bookedQtyByCable.set(
      ca.cableId,
      (bookedQtyByCable.get(ca.cableId) ?? 0) + ca.quantity,
    );
  }
  const availableCables = allCables.filter((c) => {
    if (!cableSearch) return true;
    const q = cableSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.cableType ?? "").toLowerCase().includes(q) ||
      (c.connectorA ?? "").toLowerCase().includes(q) ||
      (c.connectorB ?? "").toLowerCase().includes(q) ||
      (c.description ?? "").toLowerCase().includes(q)
    );
  });

  async function handleAddCable(cableId: string) {
    let groupId = activeCableGroupId;
    if (!groupId && cableGroups.length === 0) {
      try {
        const id = await ensureDefaultCableGroup(project.id);
        groupId = id;
        setActiveCableGroupId(id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
        return;
      }
    }
    if (!groupId) return;
    const gid = groupId;
    startTransition(async () => {
      try {
        await addCableAssignment(project.id, {
          cableId,
          groupId: gid,
          quantity: 1,
        });
        toast.success("Kabel gebucht");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleCableQtyChange(assignmentId: string, q: number) {
    if (q < 1) return;
    startTransition(async () => {
      try {
        await updateCableAssignmentQuantity(project.id, assignmentId, q);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleRemoveCable(assignmentId: string) {
    startTransition(async () => {
      try {
        await removeCableAssignment(project.id, assignmentId);
        toast.success("Kabel entfernt");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleMoveCableToGroup(assignmentId: string, groupId: string) {
    startTransition(async () => {
      try {
        await moveCableAssignmentToGroup(project.id, assignmentId, groupId);
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
            kind: groupDialog.kind,
            billable: groupDialog.billable,
          });
        } else if (groupDialog.id) {
          await updateProjectGroup(groupDialog.id, {
            name,
            billable: groupDialog.billable,
          });
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

  // Kabel-Buchungen pro Gruppe
  const cableAssignmentsByGroup = new Map<string, CableAssignmentWithCable[]>();
  for (const ca of cableAssignments) {
    const arr = cableAssignmentsByGroup.get(ca.groupId) ?? [];
    arr.push(ca);
    cableAssignmentsByGroup.set(ca.groupId, arr);
  }

  // Ad-hoc-Positionen pro Gruppe (Verkauf etc., freie Positionen ohne Stammdaten)
  const adHocByGroup = new Map<string, ProjectAdHocItem[]>();
  for (const it of adHocItems) {
    const arr = adHocByGroup.get(it.groupId) ?? [];
    arr.push(it);
    adHocByGroup.set(it.groupId, arr);
  }

  // Kommentar-Zeilen pro Gruppe
  const commentsByGroup = new Map<string, ProjectGroupComment[]>();
  for (const c of groupComments) {
    const arr = commentsByGroup.get(c.groupId) ?? [];
    arr.push(c);
    commentsByGroup.set(c.groupId, arr);
  }

  // ----- DnD-Setup -----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  type GroupRow = {
    sortId: string; // "DEVICE:abc", "ADHOC:xyz", "COMMENT:c1", "CABLE:k1"
    kind: GroupItemKind;
    id: string;
    sortOrder: number;
  };

  /** Items + AdHoc + Comments einer Gruppe als geordnete Liste (für DnD und Render). */
  function buildDeviceGroupRows(groupId: string): GroupRow[] {
    const out: GroupRow[] = [];
    for (const a of assignmentsByGroup.get(groupId) ?? []) {
      out.push({ sortId: `DEVICE:${a.id}`, kind: "DEVICE", id: a.id, sortOrder: a.sortOrder ?? 0 });
    }
    for (const it of adHocByGroup.get(groupId) ?? []) {
      out.push({ sortId: `ADHOC:${it.id}`, kind: "ADHOC", id: it.id, sortOrder: it.sortOrder ?? 0 });
    }
    for (const c of commentsByGroup.get(groupId) ?? []) {
      out.push({ sortId: `COMMENT:${c.id}`, kind: "COMMENT", id: c.id, sortOrder: c.sortOrder ?? 0 });
    }
    return out.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  function buildCableGroupRows(groupId: string): GroupRow[] {
    const out: GroupRow[] = [];
    for (const ca of cableAssignmentsByGroup.get(groupId) ?? []) {
      out.push({ sortId: `CABLE:${ca.id}`, kind: "CABLE", id: ca.id, sortOrder: ca.sortOrder ?? 0 });
    }
    for (const c of commentsByGroup.get(groupId) ?? []) {
      out.push({ sortId: `COMMENT:${c.id}`, kind: "COMMENT", id: c.id, sortOrder: c.sortOrder ?? 0 });
    }
    return out.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  function handleDragEnd(rows: GroupRow[], e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const oldIdx = rows.findIndex((r) => r.sortId === e.active.id);
    const newIdx = rows.findIndex((r) => r.sortId === e.over!.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const ordered = arrayMove(rows, oldIdx, newIdx);
    startTransition(async () => {
      try {
        await reorderGroupItems(
          project.id,
          ordered.map((r) => ({ kind: r.kind, id: r.id }))
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler beim Sortieren");
      }
    });
  }

  // ----- Kommentar-Dialog -----
  const [commentDialog, setCommentDialog] = useState<{
    mode: "create" | "edit";
    id?: string;
    groupId: string;
    text: string;
  } | null>(null);
  const [commentDelete, setCommentDelete] = useState<ProjectGroupComment | null>(null);

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
          await addGroupComment(project.id, commentDialog.groupId, text);
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

  type AdHocDialogState = {
    mode: "create" | "edit";
    id?: string;
    groupId: string;
    name: string;
    description: string;
    quantity: number;
    unitPrice: number;
  };
  const [adHocDialog, setAdHocDialog] = useState<AdHocDialogState | null>(null);
  const [adHocDelete, setAdHocDelete] = useState<ProjectAdHocItem | null>(null);

  function handleSaveAdHoc() {
    if (!adHocDialog) return;
    const name = adHocDialog.name.trim();
    if (!name) {
      toast.error("Name darf nicht leer sein");
      return;
    }
    startTransition(async () => {
      try {
        if (adHocDialog.mode === "create") {
          await addAdHocItem(project.id, {
            groupId: adHocDialog.groupId,
            name,
            description: adHocDialog.description,
            quantity: adHocDialog.quantity,
            unitPrice: adHocDialog.unitPrice,
          });
          toast.success("Vorübergehendes Gerät hinzugefügt");
        } else if (adHocDialog.id) {
          await updateAdHocItem(adHocDialog.id, {
            groupId: adHocDialog.groupId,
            name,
            description: adHocDialog.description,
            quantity: adHocDialog.quantity,
            unitPrice: adHocDialog.unitPrice,
          });
          toast.success("Vorübergehendes Gerät gespeichert");
        }
        setAdHocDialog(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleDeleteAdHoc() {
    if (!adHocDelete) return;
    const id = adHocDelete.id;
    startTransition(async () => {
      try {
        await deleteAdHocItem(id);
        toast.success("Position entfernt");
        setAdHocDelete(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  /** Rendert eine sortierbare AdHoc-Zeile in der Geräte-Tabelle (gelb hinterlegt). */
  function renderAdHocRow(it: ProjectAdHocItem, sortId: string) {
    const unit = Number(it.unitPrice);
    const line = unit * it.quantity * billingFactor;
    return (
      <SortableRow
        id={sortId}
        key={sortId}
        className="bg-yellow-50 hover:bg-yellow-100 dark:bg-yellow-950/30 dark:hover:bg-yellow-950/40 [&_td]:px-2 [&_td]:py-1"
      >
        <DragHandleCell />
        <TableCell>
          {/* AdHoc-Name einzeilig — Beschreibung wandert in eigene Spalte
              parallel zur Geräte-Tabellenstruktur. */}
          <div className="font-medium truncate">{it.name}</div>
        </TableCell>
        <TableCell className="max-w-[200px]">
          <div className="text-xs text-muted-foreground truncate">
            {it.description?.trim() ?? ""}
          </div>
        </TableCell>
        <TableCell className="text-right">
          <QuantityInput
            min={1}
            value={it.quantity}
            onChange={(v) =>
              startTransition(async () => {
                try {
                  await updateAdHocItem(it.id, {
                    groupId: it.groupId,
                    name: it.name,
                    description: it.description ?? "",
                    quantity: v,
                    unitPrice: unit,
                  });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Fehler");
                }
              })
            }
            disabled={pending}
            className="h-7 w-16 text-right tabular-nums ml-auto"
          />
        </TableCell>
        <TableCell className="text-right tabular-nums font-mono text-sm">
          {formatCurrency(unit)}
        </TableCell>
        <TableCell className="text-right tabular-nums font-mono text-sm font-medium">
          {formatCurrency(line)}
        </TableCell>
        {!isSale && <TableCell />}
        <TableCell>
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() =>
                setAdHocDialog({
                  mode: "edit",
                  id: it.id,
                  groupId: it.groupId,
                  name: it.name,
                  description: it.description ?? "",
                  quantity: it.quantity,
                  unitPrice: unit,
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
              onClick={() => setAdHocDelete(it)}
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

  /** Rendert eine sortierbare Geräte-Zeile innerhalb der Material-Tabelle. */
  function renderDeviceRow(a: AssignmentWithDevice, sortId: string) {
    const conflict = conflictMap[a.deviceId];
    const isReserved = reservedSet.has(a.deviceId);
    // Zumiet-Menge für dieses Gerät (deckt einen Bestandsengpass ab).
    const subhiredQty = subhireQtyByDevice.get(a.deviceId) ?? 0;
    const hasSubhire = subhiredQty > 0;
    const shortfall = conflict
      ? Math.max(0, conflict.totalDemand - a.device.stockQuantity)
      : 0;
    const isOver = !isReserved && shortfall > 0;
    // Durch Zumietung nicht gedeckter Rest-Engpass — nur dieser bleibt rot.
    const uncoveredOver = Math.max(0, shortfall - subhiredQty);
    const showOverWarning = isOver && uncoveredOver > 0;
    const rate = Number(a.device.dailyRate);
    const lineTotal = rate * a.quantity * billingFactor;
    return (
      <Fragment key={sortId}>
        <SortableRow
          id={sortId}
          className={cn(
            "[&_td]:px-2 [&_td]:py-1",
            // Zugemietet → blau (dominiert die Warnung optisch).
            hasSubhire &&
              "bg-blue-50/70 hover:bg-blue-50 dark:bg-blue-950/30 dark:hover:bg-blue-950/40",
            !hasSubhire &&
              showOverWarning &&
              "bg-red-50/70 hover:bg-red-50 dark:bg-red-950/30 dark:hover:bg-red-950/40"
          )}
        >
          <DragHandleCell />
          <TableCell>
            {/* Name + (optional) Hersteller/Modell als Sub-Zeile — nur dann
                anzeigen, wenn der zusammengesetzte make-Text NICHT identisch
                mit device.name ist (häufiger Fall: name = "Coda Audio G15-Sub"
                und manufacturer/model = "Coda Audio" + "G15-Sub" → würde
                "Coda Audio G15-Sub" als Sub-Zeile doppeln). */}
            {(() => {
              const make = [a.device.manufacturer, a.device.model]
                .filter(Boolean)
                .join(" ");
              const showMake =
                make && make.toLowerCase() !== a.device.name.toLowerCase();
              return (
                <>
                  <div className={cn("font-medium truncate", showOverWarning && "text-destructive")}>
                    {a.device.name}
                  </div>
                  {showMake && (
                    <div className="text-[11px] text-muted-foreground truncate">
                      {make}
                    </div>
                  )}
                  {hasSubhire && (
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                      <HandCoins className="h-3 w-3" />
                      zugemietet: {subhiredQty} Stk.
                    </div>
                  )}
                </>
              );
            })()}
          </TableCell>
          <TableCell className="max-w-[200px]">
            <div className="text-xs text-muted-foreground truncate">
              {a.device.description?.trim() ?? ""}
            </div>
          </TableCell>
          <TableCell className="text-right">
            <QuantityInput
              min={1}
              value={a.quantity}
              onChange={(v) => handleQtyChange(a.id, v)}
              disabled={pending}
              className={cn(
                "h-7 w-16 text-right tabular-nums ml-auto",
                showOverWarning && "border-destructive focus-visible:ring-destructive"
              )}
            />
          </TableCell>
          <TableCell className="text-right tabular-nums font-mono text-sm">
            {formatCurrency(rate)}
          </TableCell>
          <TableCell className="text-right tabular-nums font-mono text-sm font-medium">
            {formatCurrency(lineTotal)}
          </TableCell>
          {!isSale && (
            <TableCell>
              {isReserved ? (
                <span className="text-xs font-medium text-green-600">gebucht</span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
          )}
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
                className={cn(
                  "h-7 w-7",
                  hasSubhire && "text-blue-600 dark:text-blue-400"
                )}
                onClick={() =>
                  setSubhireDialog(
                    emptySubhire({
                      deviceId: a.deviceId,
                      name: a.device.name,
                      quantity: Math.max(1, uncoveredOver),
                    })
                  )
                }
                disabled={pending}
                title="Material zumieten"
              >
                <HandCoins className="h-4 w-4" />
              </Button>
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
        </SortableRow>
        {showOverWarning && (() => {
          const stock = a.device.stockQuantity;
          const booked = conflict.ownBookedQuantity || a.quantity;
          const ownEff = conflict.ownEffectiveQuantity || booked;
          const ownExtra = ownEff - booked;
          const ownPacks = conflict.ownBlockingPackUnits;
          // Rest-Engpass nach Abzug der Zumietung.
          const overBy = uncoveredOver;
          const foreignNames = conflict.otherProjects
            .map((op) => op.projectName)
            .join(", ");
          return (
            <TableRow className="bg-destructive/10 hover:bg-destructive/10">
              <TableCell colSpan={isSale ? 7 : 8} className="py-1.5 text-xs text-destructive">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    <span className="font-semibold">{overBy} zu viel:</span>{" "}
                    <span className="font-medium">{booked}</span> gebucht
                    {ownExtra > 0 && ownPacks.length > 0 && (
                      <>
                        {" "}
                        → <span className="font-medium">{ownEff}</span> belegt
                        durch Case „{ownPacks[0].name}" ({ownPacks[0].perUnit}/Case)
                      </>
                    )}
                    {foreignNames && (
                      <>
                        {" "}
                        + bereits in <span className="font-medium">{foreignNames}</span>
                      </>
                    )}
                    , Bestand: <span className="font-medium">{stock}</span>
                  </span>
                </div>
              </TableCell>
            </TableRow>
          );
        })()}
      </Fragment>
    );
  }

  /**
   * Rendert eine freie (nicht mit einem Gerät verknüpfte) Zumietung als eigene
   * blaue Zeile in der Material-Tabelle. Preis-Spalten bleiben leer — die Kosten
   * sind rein intern und gehören nicht in die Kunden-Preisspalten.
   */
  function renderFreeSubhireRow(s: SubhireVM) {
    return (
      <TableRow
        key={`SUBHIRE:${s.id}`}
        className="bg-blue-50/70 hover:bg-blue-50 dark:bg-blue-950/30 dark:hover:bg-blue-950/40 [&_td]:px-2 [&_td]:py-1"
      >
        <TableCell />
        <TableCell>
          <div className="font-medium truncate">{s.name}</div>
          <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400">
            <HandCoins className="h-3 w-3" />
            zugemietet{s.supplier ? ` · ${s.supplier}` : ""}
          </div>
        </TableCell>
        <TableCell className="max-w-[200px]" />
        <TableCell className="text-right tabular-nums font-mono text-sm">
          {s.quantity}
        </TableCell>
        <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
        <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
        {!isSale && (
          <TableCell>
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
              zugemietet
            </span>
          </TableCell>
        )}
        <TableCell>
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Bearbeiten"
              onClick={() =>
                setSubhireDialog({
                  id: s.id,
                  deviceId: s.deviceId,
                  groupId: s.groupId,
                  name: s.name,
                  supplier: s.supplier ?? "",
                  quantity: s.quantity,
                  unitCost: s.unitCost,
                  notes: "",
                })
              }
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              title="Entfernen"
              onClick={() => setSubhireDelete(s)}
              disabled={pending}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  /** Rendert eine sortierbare Kabel-Zeile innerhalb der Kabel-Tabelle. */
  function renderCableRow(ca: CableAssignmentWithCable, sortId: string) {
    const conf = cableConflictMap[ca.cableId];
    const totalDemand =
      (conf?.packAllocation ?? 0) + (conf?.foreignTotal ?? 0) + ca.quantity;
    const stock = conf?.stock ?? ca.cable.stockQuantity;
    const isOver = totalDemand > stock;
    const overBy = totalDemand - stock;
    return (
      <Fragment key={sortId}>
        <SortableRow
          id={sortId}
          className={cn(
            isOver &&
              "bg-red-50/70 hover:bg-red-50 dark:bg-red-950/30 dark:hover:bg-red-950/40"
          )}
        >
          <DragHandleCell />
          <TableCell>
            <div className={cn("font-medium", isOver && "text-destructive")}>
              {ca.cable.name}
            </div>
            {ca.cable.cableType && (
              <div className="text-[11px] text-muted-foreground">
                {ca.cable.cableType}
                {ca.cable.lengthMeters
                  ? ` · ${Number(ca.cable.lengthMeters)} m`
                  : ""}
              </div>
            )}
          </TableCell>
          <TableCell className="text-right">
            <QuantityInput
              min={1}
              value={ca.quantity}
              onChange={(v) => handleCableQtyChange(ca.id, v)}
              disabled={pending}
              className={cn(
                "h-8 w-16 text-right tabular-nums ml-auto",
                isOver && "border-destructive focus-visible:ring-destructive"
              )}
            />
          </TableCell>
          <TableCell>
            <div className="flex items-center justify-end gap-1">
              {cableGroups.length > 1 && (
                <Select
                  value={ca.groupId}
                  onValueChange={(v) => handleMoveCableToGroup(ca.id, v)}
                >
                  <SelectTrigger className="h-7 w-[110px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cableGroups.map((og) => (
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
                onClick={() => handleRemoveCable(ca.id)}
                disabled={pending}
                title="Entfernen"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </TableCell>
        </SortableRow>
        {isOver && (
          <TableRow className="bg-destructive/10 hover:bg-destructive/10">
            <TableCell colSpan={4} className="py-1.5 text-xs text-destructive">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>
                  <span className="font-semibold">{overBy} zu viel:</span>{" "}
                  <span className="font-medium">{ca.quantity}</span> gebucht
                  {conf && conf.packAllocation > 0 && (
                    <>
                      {" "}
                      + <span className="font-medium">{conf.packAllocation}</span>{" "}
                      in Packeinheiten
                    </>
                  )}
                  {conf && conf.foreignBookings.length > 0 && (
                    <>
                      {" "}
                      + <span className="font-medium">{conf.foreignTotal}</span>{" "}
                      in {conf.foreignBookings.map((f) => f.projectName).join(", ")}
                    </>
                  )}
                  , Bestand: <span className="font-medium">{stock}</span>
                </span>
              </div>
            </TableCell>
          </TableRow>
        )}
      </Fragment>
    );
  }

  /** Comment-Row mit demselben Stil wie Geräte-Comments, aber colSpan an die
   *  Spaltenzahl der Kabel-Tabelle angepasst (Kabel hat 4 Spalten). */
  function renderCommentRow(c: ProjectGroupComment, sortId: string, colSpan: number) {
    return (
      <SortableRow
        id={sortId}
        key={sortId}
        className="bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-950/60 border-t-2 border-blue-200 dark:border-blue-900/50"
      >
        <DragHandleCell />
        <TableCell colSpan={colSpan} className="py-3 text-base font-semibold text-foreground">
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

  return (
    <>
      <div className="mb-3 flex justify-end gap-2">
        <ScanDialog
          projectId={project.id}
          hasAssignments={project.assignments.length > 0}
          packedCount={scanProgress.packed}
          totalCount={scanProgress.total}
        />
        <Button
          asChild
          size="sm"
          variant="default"
          disabled={project.assignments.length === 0}
        >
          <a
            href={`/api/projects/${project.id}/packlist.pdf?download=1`}
            download
            rel="noopener"
            title={
              project.assignments.length === 0
                ? "Erst Geräte buchen"
                : "Packliste herunterladen"
            }
            aria-disabled={project.assignments.length === 0}
            onClick={(e) => {
              if (project.assignments.length === 0) e.preventDefault();
            }}
          >
            <Download className="h-4 w-4" /> Packliste herunterladen
          </a>
        </Button>
      </div>
      <Card className="p-4">
      <Tabs defaultValue="devices" className="space-y-4">
        <TabsList>
          <TabsTrigger value="devices">
            <Package className="h-4 w-4" /> Geräte
            <span className="ml-1 text-muted-foreground">
              ({project.assignments.length})
            </span>
          </TabsTrigger>
          <TabsTrigger value="cables">
            <CableIcon className="h-4 w-4" /> Kabel
            <span className="ml-1 text-muted-foreground">
              ({cableAssignments.length})
            </span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="devices" className="mt-0">
      <HorizontalSplit
        storageKey="devo:material-split"
        defaultLeftPx={360}
        minLeftPx={280}
        minRightPx={520}
        className="lg:items-start"
        leftClassName="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)]"
        left={
          <Card className="border-0 shadow-none flex flex-col lg:h-[calc(100vh-2rem)]">
            <CardHeader className="px-0 pt-0 pb-3 space-y-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" /> Geräte-Katalog
              </CardTitle>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Suche…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 pl-8"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0 lg:flex-1 lg:overflow-y-auto">
              {/* Mini-Tabellen-Header — erklärt was die kleine Zahl rechts
                  neben dem Namen bedeutet (verfügbarer Bestand). */}
              <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <span className="flex-1">Bezeichnung</span>
                <span className="w-10 text-right">Bestand</span>
                <span className="w-7" />
              </div>
              {availableDevices.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {allDevices.length === 0
                    ? "Noch keine Geräte angelegt"
                    : "Keine Treffer"}
                </p>
              ) : (
                <ul className="divide-y">
                  {groupItemsByCategory(availableDevices, categories).map((catGroup) => {
                    // Wenn ein Vorfahr eingeklappt ist, gar nicht rendern
                    if (catGroup.ancestorKeys.some((k) => collapsedCats.has(k))) {
                      return null;
                    }
                    const isCollapsed = collapsedCats.has(catGroup.key);
                    return (
                      <li key={catGroup.key}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-1.5 bg-muted/50 px-3 py-2 text-left text-xs font-semibold hover:bg-muted"
                          onClick={() => toggleCat(catGroup.key)}
                          style={{ paddingLeft: `${0.75 + catGroup.depth * 1.5}rem` }}
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
                          {catGroup.items.length > 0 && (
                            <span className="shrink-0 text-muted-foreground font-normal">
                              {catGroup.items.length}
                            </span>
                          )}
                        </button>
                        {!isCollapsed && (
                          <ul className="divide-y">
                            {catGroup.items.map((d) => {
                              const bookedQty = bookedQtyByDevice.get(d.id) ?? 0;
                              // Bestand wird um die im Projekt bereits gebuchten
                              // Stücke reduziert, kann nicht unter 0 fallen.
                              const remainingStock = Math.max(
                                0,
                                d.stockQuantity - bookedQty,
                              );
                              return (
                                <li
                                  key={d.id}
                                  className="group flex items-center gap-2 pr-2 py-1 hover:bg-accent/40"
                                  style={{ paddingLeft: `${1.25 + catGroup.depth * 1.25}rem` }}
                                >
                                  {/* Kompakte Katalog-Zeile — Name truncated,
                                      Bestand als kleine Sub-Info rechts.
                                      Description-Preview und €/Tag bewusst
                                      weggelassen für mehr Lesbarkeit. */}
                                  <div className="flex-1 min-w-0">
                                    <div className="truncate text-sm font-medium">
                                      {d.name}
                                    </div>
                                  </div>
                                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                                    {remainingStock}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0 opacity-60 group-hover:opacity-100"
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
                    setGroupDialog({ mode: "create", name: "", billable: true, kind: "MATERIAL" })
                  }
                >
                  <FolderPlus className="h-4 w-4" /> Gruppe anlegen
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={groups.length === 0}
                  title={
                    groups.length === 0
                      ? "Erst eine Gruppe anlegen"
                      : "Freie Position (Verkauf etc.) hinzufügen"
                  }
                  onClick={() =>
                    setAdHocDialog({
                      mode: "create",
                      groupId: activeGroupId ?? groups[0]?.id ?? "",
                      name: "",
                      description: "",
                      quantity: 1,
                      unitPrice: 0,
                    })
                  }
                >
                  <Plus className="h-4 w-4" /> Vorübergehendes Gerät hinzufügen
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  title="Fehlendes Material zumieten (interne Kostenposition)"
                  onClick={() =>
                    setSubhireDialog(
                      emptySubhire({ groupId: activeGroupId ?? groups[0]?.id ?? null })
                    )
                  }
                >
                  <HandCoins className="h-4 w-4" /> Zumieten
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
                    onClick={() => setGroupDialog({ mode: "create", name: "", billable: true, kind: "MATERIAL" })}
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
                        {!g.billable && (
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
                              groupId: g.id,
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
                            setGroupDialog({ mode: "rename", id: g.id, name: g.name, billable: g.billable, kind: "MATERIAL" });
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
                    {(() => {
                      // Geräte + AdHoc + Comments gemixt nach sortOrder.
                      // AdHoc-Items werden wie Geräte als normale Zeilen
                      // gerendert (mit gelbem Hintergrund) und mit dem
                      // Tagesfaktor multipliziert.
                      const mainRows = buildDeviceGroupRows(g.id);
                      const freeSubs = freeSubhiresByGroup.get(g.id) ?? [];
                      if (mainRows.length === 0 && freeSubs.length === 0) {
                      return (
                      <p className="py-4 text-center text-xs text-muted-foreground">
                        Noch nichts in dieser Gruppe. Klicke ein Gerät aus dem
                        Katalog (Pfeil-Button) — es wird der aktiven Gruppe
                        hinzugefügt.
                      </p>
                      );
                      }
                      return (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(e) => handleDragEnd(mainRows, e)}
                      >
                      <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:h-9 [&_th]:px-3">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-6"></TableHead>
                            <TableHead className="px-2">Gerät</TableHead>
                            <TableHead className="px-2">Beschreibung</TableHead>
                            <TableHead className="text-right w-[80px] px-2">Anzahl</TableHead>
                            <TableHead className="text-right w-[100px] px-2">
                              {isSale ? "€ / Stück" : "€ / Tag"}
                            </TableHead>
                            <TableHead className="text-right w-[120px] px-2">Summe</TableHead>
                            {!isSale && <TableHead className="w-[100px] px-2">Status</TableHead>}
                            <TableHead className="w-[120px] px-2"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                        <SortableContext
                          items={mainRows.map((r) => r.sortId)}
                          strategy={verticalListSortingStrategy}
                        >
                        {mainRows.map((r) => {
                          if (r.kind === "COMMENT") {
                            const c = (commentsByGroup.get(g.id) ?? []).find(
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
                                <TableCell
                                  colSpan={isSale ? 5 : 6}
                                  className="py-3 text-base font-semibold text-foreground"
                                >
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
                          if (r.kind === "ADHOC") {
                            const it = (adHocByGroup.get(g.id) ?? []).find(
                              (x) => x.id === r.id
                            );
                            if (!it) return null;
                            return renderAdHocRow(it, r.sortId);
                          }
                          // DEVICE
                          const a = groupAssignments.find((x) => x.id === r.id);
                          if (!a) return null;
                          return renderDeviceRow(a, r.sortId);
                        })}
                        </SortableContext>
                        {/* Freie Zumietungen (kein Gerät verknüpft) — nicht
                            sortierbar, ans Gruppenende gehängt, blau markiert. */}
                        {freeSubs.map((s) => renderFreeSubhireRow(s))}
                        </TableBody>
                      </Table>
                      </DndContext>
                      );
                    })()}

                    {/* AdHoc-Items werden jetzt direkt in der Hauptliste oben
                        gerendert (gelber Hintergrund). Kein separater Bereich
                        mehr nötig. */}
                    </CardContent>
                  </Card>
                );
              })}

              {(project.assignments.length > 0 || adHocItems.length > 0) && (
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
                  {!isSale && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {billingDays} Tag(e) · Mietfaktor ×{billingFactor.toFixed(2)}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        }
      />
        </TabsContent>

        <TabsContent value="cables" className="mt-0">
      <HorizontalSplit
        storageKey="devo:cables-split"
        defaultLeftPx={360}
        minLeftPx={280}
        minRightPx={520}
        className="lg:items-start"
        leftClassName="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)]"
        left={
          <Card className="border-0 shadow-none flex flex-col lg:h-[calc(100vh-2rem)]">
            <CardHeader className="px-0 pt-0 pb-3 space-y-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CableIcon className="h-4 w-4" /> Kabel-Katalog
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
            <CardContent className="p-0 lg:flex-1 lg:overflow-y-auto">
              {/* Mini-Tabellen-Header — die kleine Zahl zeigt verfügbare
                  Kabel (Bestand minus Pack-Allokation minus eigene Buchung). */}
              <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <span className="flex-1">Bezeichnung</span>
                <span className="w-12 text-right">frei</span>
                <span className="w-7" />
              </div>
              {availableCables.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {allCables.length === 0
                    ? "Noch keine Kabel angelegt"
                    : "Keine Treffer"}
                </p>
              ) : (
                <ul className="divide-y">
                  {groupItemsByCategory(availableCables, categories).map((catGroup) => {
                    if (catGroup.ancestorKeys.some((k) => collapsedCats.has(k))) {
                      return null;
                    }
                    const isCollapsed = collapsedCats.has(catGroup.key);
                    return (
                      <li key={catGroup.key}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-1.5 bg-muted/50 px-3 py-2 text-left text-xs font-semibold hover:bg-muted"
                          onClick={() => toggleCat(catGroup.key)}
                          style={{ paddingLeft: `${0.75 + catGroup.depth * 1.5}rem` }}
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
                          {catGroup.items.length > 0 && (
                            <span className="shrink-0 text-muted-foreground font-normal">
                              {catGroup.items.length}
                            </span>
                          )}
                        </button>
                        {!isCollapsed && (
                          <ul className="divide-y">
                            {catGroup.items.map((c) => {
                              const conf = cableConflictMap[c.id];
                              const reserved = conf?.packAllocation ?? 0;
                              const bookedQty = bookedQtyByCable.get(c.id) ?? 0;
                              // Frei = Bestand minus Pack-Reservierung minus
                              // bereits in DIESEM Projekt gebuchte Stück.
                              const free = Math.max(
                                0,
                                c.stockQuantity - reserved - bookedQty,
                              );
                              return (
                                <li
                                  key={c.id}
                                  className="group flex items-center gap-2 pr-2 py-1 hover:bg-accent/40"
                                  style={{ paddingLeft: `${1.25 + catGroup.depth * 1.25}rem` }}
                                >
                                  {/* Kompakt: nur Name + freier Bestand,
                                      Cable-Type-Sublabel weggelassen. */}
                                  <div className="flex-1 min-w-0">
                                    <div className="truncate text-sm font-medium">{c.name}</div>
                                  </div>
                                  <span className={cn(
                                    "shrink-0 text-[11px] tabular-nums",
                                    free <= 0 ? "text-destructive font-semibold" : "text-muted-foreground",
                                  )}>
                                    {free} frei
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0 opacity-60 group-hover:opacity-100"
                                    disabled={pending}
                                    onClick={() => handleAddCable(c.id)}
                                    title={
                                      activeCableGroupId
                                        ? `Zur Gruppe "${cableGroups.find((g) => g.id === activeCableGroupId)?.name}" hinzufügen`
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
                <CableIcon className="h-4 w-4" /> Gebuchte Kabel
                {cableAssignments.length > 0 && (
                  <Badge variant="outline">{cableAssignments.length} Typen</Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                {cableGroups.length > 0 && (
                  <Select
                    value={activeCableGroupId ?? ""}
                    onValueChange={(v) => setActiveCableGroupId(v)}
                  >
                    <SelectTrigger className="w-[200px] h-8 text-xs">
                      <SelectValue placeholder="Aktive Gruppe…" />
                    </SelectTrigger>
                    <SelectContent>
                      {cableGroups.map((g) => (
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
                    setGroupDialog({ mode: "create", name: "", billable: true, kind: "CABLE" })
                  }
                >
                  <FolderPlus className="h-4 w-4" /> Gruppe anlegen
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 lg:flex-1 lg:overflow-y-auto">
              {cableGroups.length === 0 && (
                <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
                  <p>Noch keine Kabel-Gruppen — beim ersten Buchen wird automatisch eine angelegt.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => setGroupDialog({ mode: "create", name: "", billable: true, kind: "CABLE" })}
                  >
                    <FolderPlus className="h-4 w-4" /> Erste Gruppe anlegen
                  </Button>
                </div>
              )}
              {cableGroups.map((g) => {
                const groupCables = cableAssignmentsByGroup.get(g.id) ?? [];
                const isActive = activeCableGroupId === g.id;
                return (
                  <Card
                    key={g.id}
                    className={cn(
                      "mb-4 last:mb-0 transition-shadow cursor-pointer",
                      isActive && "border-primary/60 shadow-md"
                    )}
                    onClick={() => setActiveCableGroupId(g.id)}
                  >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <CardTitle className="text-base truncate flex items-center gap-2">
                          <Folder className="h-4 w-4 text-muted-foreground" />
                          {g.name}
                        </CardTitle>
                        <Badge variant="outline" className="text-[10px]">
                          {groupCables.length}
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
                            setCommentDialog({
                              mode: "create",
                              groupId: g.id,
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
                            setGroupDialog({ mode: "rename", id: g.id, name: g.name, billable: g.billable, kind: "CABLE" });
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
                      {(() => {
                        const cableRows = buildCableGroupRows(g.id);
                        if (cableRows.length === 0) {
                          return (
                            <p className="py-4 text-center text-xs text-muted-foreground">
                              Noch nichts in dieser Gruppe. Klicke ein Kabel aus dem
                              Katalog (Pfeil-Button) — es wird der aktiven Gruppe
                              hinzugefügt.
                            </p>
                          );
                        }
                        return (
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={(e) => handleDragEnd(cableRows, e)}
                          >
                            <Table className="[&_td]:py-1 [&_td]:px-2 [&_th]:h-8 [&_th]:px-2">
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-6"></TableHead>
                                  <TableHead>Kabel</TableHead>
                                  <TableHead className="text-right w-[80px]">Anzahl</TableHead>
                                  <TableHead className="w-[120px]"></TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                <SortableContext
                                  items={cableRows.map((r) => r.sortId)}
                                  strategy={verticalListSortingStrategy}
                                >
                                  {cableRows.map((r) => {
                                    if (r.kind === "COMMENT") {
                                      const c = (commentsByGroup.get(g.id) ?? []).find(
                                        (x) => x.id === r.id
                                      );
                                      if (!c) return null;
                                      return renderCommentRow(c, r.sortId, 2);
                                    }
                                    const ca = groupCables.find((x) => x.id === r.id);
                                    if (!ca) return null;
                                    return renderCableRow(ca, r.sortId);
                                  })}
                                </SortableContext>
                              </TableBody>
                            </Table>
                          </DndContext>
                        );
                      })()}
                      {false && (
                        <Table>
                          <TableBody>
                            {groupCables.map((ca) => {
                              const conf = cableConflictMap[ca.cableId];
                              const totalDemand = (conf?.packAllocation ?? 0) +
                                (conf?.foreignTotal ?? 0) + ca.quantity;
                              const stock = conf?.stock ?? ca.cable.stockQuantity;
                              const isOver = totalDemand > stock;
                              const overBy = totalDemand - stock;
                              return (
                                <Fragment key={ca.id}>
                                  <TableRow
                                    className={cn(
                                      isOver &&
                                        "bg-red-50/70 hover:bg-red-50 dark:bg-red-950/30 dark:hover:bg-red-950/40"
                                    )}
                                  >
                                    <TableCell>
                                      <div className={cn("font-medium", isOver && "text-destructive")}>
                                        {ca.cable.name}
                                      </div>
                                      {ca.cable.cableType && (
                                        <div className="text-[11px] text-muted-foreground">
                                          {ca.cable.cableType}
                                          {ca.cable.lengthMeters
                                            ? ` · ${Number(ca.cable.lengthMeters)} m`
                                            : ""}
                                        </div>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <QuantityInput
                                        min={1}
                                        value={ca.quantity}
                                        onChange={(v) => handleCableQtyChange(ca.id, v)}
                                        disabled={pending}
                                        className={cn(
                                          "h-8 w-16 text-right tabular-nums ml-auto",
                                          isOver && "border-destructive focus-visible:ring-destructive"
                                        )}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex items-center justify-end gap-1">
                                        {cableGroups.length > 1 && (
                                          <Select
                                            value={ca.groupId}
                                            onValueChange={(v) => handleMoveCableToGroup(ca.id, v)}
                                          >
                                            <SelectTrigger className="h-7 w-[110px] text-xs">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {cableGroups.map((og) => (
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
                                          onClick={() => handleRemoveCable(ca.id)}
                                          disabled={pending}
                                          title="Entfernen"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                  {isOver && (
                                    <TableRow className="bg-destructive/10 hover:bg-destructive/10">
                                      <TableCell colSpan={3} className="py-1.5 text-xs text-destructive">
                                        <div className="flex items-center gap-1.5">
                                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                          <span>
                                            <span className="font-semibold">{overBy} zu viel:</span>{" "}
                                            <span className="font-medium">{ca.quantity}</span> gebucht
                                            {conf && conf.packAllocation > 0 && (
                                              <>
                                                {" "}
                                                + <span className="font-medium">{conf.packAllocation}</span>{" "}
                                                in Packeinheiten
                                              </>
                                            )}
                                            {conf && conf.foreignBookings.length > 0 && (
                                              <>
                                                {" "}
                                                + <span className="font-medium">{conf.foreignTotal}</span>{" "}
                                                in {conf.foreignBookings.map((f) => f.projectName).join(", ")}
                                              </>
                                            )}
                                            , Bestand: <span className="font-medium">{stock}</span>
                                          </span>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </Fragment>
                              );
                            })}
                          </TableBody>
                        </Table>
                      )}
                      {/* /false dead-code */}
                    </CardContent>
                  </Card>
                );
              })}
            </CardContent>
          </Card>
        }
      />
        </TabsContent>
      </Tabs>

      {/* Gruppe-Dialog */}
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
            {groupDialog?.kind !== "CABLE" && (
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
            )}
            {groupDialog?.kind === "CABLE" && (
              <p className="text-xs text-muted-foreground">
                Kabel-Gruppen erscheinen nie auf Angeboten oder Rechnungen.
              </p>
            )}
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

      {/* Ad-hoc-Position Dialog */}
      <Dialog
        open={adHocDialog !== null}
        onOpenChange={(o) => !o && setAdHocDialog(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {adHocDialog?.mode === "create"
                ? "Vorübergehendes Gerät hinzufügen"
                : "Vorübergehendes Gerät bearbeiten"}
            </DialogTitle>
            <DialogDescription>
              Z.B. Weiterverkaufs-Geräte ohne Lager-Stammdaten. Wird mit
              Stückpreis × Anzahl auf Rechnungen/Angeboten ausgegeben, ohne
              Miet-Tagesfaktor.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveAdHoc();
            }}
            className="space-y-3"
          >
            {groups.length > 1 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Gruppe</label>
                <Select
                  value={adHocDialog?.groupId ?? ""}
                  onValueChange={(v) =>
                    setAdHocDialog((d) => (d ? { ...d, groupId: v } : d))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Gruppe wählen…" />
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
            <div className="space-y-2">
              <label className="text-sm font-medium">Bezeichnung</label>
              <Input
                value={adHocDialog?.name ?? ""}
                onChange={(e) =>
                  setAdHocDialog((d) => (d ? { ...d, name: e.target.value } : d))
                }
                autoFocus
                required
                placeholder="z.B. iPad Pro 12,9″ 256 GB"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Beschreibung (optional)
              </label>
              <Input
                value={adHocDialog?.description ?? ""}
                onChange={(e) =>
                  setAdHocDialog((d) =>
                    d ? { ...d, description: e.target.value } : d
                  )
                }
                placeholder="Zusatztext für die Rechnung"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Anzahl</label>
                <QuantityInput
                  min={1}
                  value={adHocDialog?.quantity ?? 1}
                  onChange={(v) =>
                    setAdHocDialog((d) => (d ? { ...d, quantity: v } : d))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Stückpreis (€)</label>
                <QuantityInput
                  min={0}
                  step={0.01}
                  allowDecimal
                  value={adHocDialog?.unitPrice ?? 0}
                  onChange={(v) =>
                    setAdHocDialog((d) => (d ? { ...d, unitPrice: v } : d))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAdHocDialog(null)}
                disabled={pending}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {adHocDialog?.mode === "create" ? "Hinzufügen" : "Speichern"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={adHocDelete !== null}
        onOpenChange={(o) => !o && setAdHocDelete(null)}
        title="Position entfernen?"
        description={
          adHocDelete && (
            <>
              Die Position <strong>{adHocDelete.name}</strong> wird aus dem
              Projekt entfernt.
            </>
          )
        }
        confirmLabel="Entfernen"
        pending={pending}
        onConfirm={handleDeleteAdHoc}
      />

      {/* Kommentar-Dialog (für alle Tabs) */}
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
              Freier Text in der Material-/Kabel-/Service-Tabelle. Erscheint
              auch auf Angeboten und Rechnungen an der gleichen Position.
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
                  <li key={i}>{c.projectName}</li>
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

      {/* Zumietung anlegen/bearbeiten direkt aus dem Material-Tab. */}
      <SubhireDialog
        projectId={project.id}
        value={subhireDialog}
        onClose={() => setSubhireDialog(null)}
        devices={deviceOptions}
        groups={materialGroupOptions}
      />
      <ConfirmDialog
        open={subhireDelete !== null}
        onOpenChange={(o) => !o && setSubhireDelete(null)}
        title="Zumietung entfernen?"
        description={
          subhireDelete && (
            <span>
              Die Zumietung <strong>{subhireDelete.name}</strong> wird dauerhaft
              entfernt.
            </span>
          )
        }
        confirmLabel="Entfernen"
        pending={pending}
        onConfirm={handleDeleteSubhire}
      />
    </>
  );
}
