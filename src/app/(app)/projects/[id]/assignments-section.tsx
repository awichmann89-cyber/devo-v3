"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { FilterSearch } from "@/components/filters/filter-controls";
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
import { InfoHint } from "@/components/ui/info-hint";
import { QuantityInput } from "@/components/ui/quantity-input";
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
  ArrowRight,
  Pencil,
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
  renameProjectGroup,
  reorderProjectGroups,
} from "./groups-actions";
import {
  GroupHeaderRow,
  NoteRowCells,
  QtyStepper,
  GroupTableFooter,
} from "@/components/project/group-table";
import { ScanDialog } from "./scan-dialog";
import { toast } from "sonner";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { cableSpecLabel } from "@/lib/labels";
import { HorizontalSplit } from "@/components/ui/horizontal-split";
import { useTransitionSaveStatus } from "@/lib/use-auto-save";
import { AutoSaveIndicator } from "@/components/ui/auto-save-indicator";
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
import { Cable as CableIcon } from "lucide-react";
import {
  addCableAssignment,
  removeCableAssignment,
  updateCableAssignmentQuantity,
  moveCableAssignmentToGroup,
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
import { Plus, HandCoins } from "lucide-react";
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
import { toastError } from "@/lib/toast";

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
  /** Berechnungstage/Tagesfaktor pro Gruppe (eigene Zeitraum-Auswahl, Migration 25). */
  groupDays: Record<string, number>;
  groupFactors: Record<string, number>;
  /** Berechnungszeiträume des Projekts (für die Gruppen-Zeitraum-Auswahl). */
  billingPeriods: { id: string; start: string; end: string; notes: string | null }[];
  /** Zeitraum-Auswahl je Gruppe (leer = alle Zeiträume). */
  groupPeriodIds: Record<string, string[]>;
  subtotal: number;
  discount: number;
  total: number;
  /** Material-Gruppen — enthalten Geräte, Kabel und Ad-hoc-Positionen. */
  groups: ProjectGroup[];
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
  adHocItemId: string | null;
  groupId: string | null;
  /** Gruppe auf der Kosten-Seite (kind SUBHIRE) — beim Bearbeiten durchreichen. */
  costGroupId: string | null;
  name: string;
  supplier: string | null;
  quantity: number;
  unitCost: number;
  notes: string | null;
}

type ConflictPrompt = {
  deviceId: string;
  deviceName: string;
  conflicts: { projectName: string; planningStart: Date; planningEnd: Date }[];
};

/**
 * Download-Button für ein Projekt-Dokument (Packliste, Lieferschein).
 *
 * `Button asChild` rendert einen `<a>` — `disabled` greift an einem Anchor
 * nicht, deshalb zusätzlich `aria-disabled` und ein abgefangener Klick.
 */
function DocumentDownloadButton({
  href,
  label,
  title,
  enabled,
  variant = "default",
}: {
  href: string;
  label: string;
  title: string;
  enabled: boolean;
  variant?: "default" | "outline";
}) {
  return (
    <Button asChild size="sm" variant={variant} disabled={!enabled}>
      <a
        href={href}
        download
        rel="noopener"
        title={enabled ? title : "Erst Geräte oder Kabel buchen"}
        aria-disabled={!enabled}
        onClick={(e) => {
          if (!enabled) e.preventDefault();
        }}
      >
        <Download className="h-4 w-4" /> {label}
      </a>
    </Button>
  );
}

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
  groupDays,
  groupFactors,
  billingPeriods,
  groupPeriodIds,
  subtotal,
  discount,
  total,
  groups,
  adHocItems,
  groupComments,
  categories,
  scanProgress,
  isSale,
  subhires,
}: Props) {
  const reservedSet = new Set(reservedDeviceIds);
  const [pending, startTransition] = useTransition();
  const saveStatus = useTransitionSaveStatus(pending);

  // Tagesfaktor/-tage einer Gruppe — Fallback auf die globalen Werte.
  const factorFor = (groupId: string) => groupFactors[groupId] ?? billingFactor;
  const daysFor = (groupId: string) => groupDays[groupId] ?? billingDays;
  /** Label eines Berechnungszeitraums für die Gruppen-Zeitraum-Auswahl —
   *  inkl. Uhrzeiten, wenn der Zeitraum welche trägt. */
  function periodLabel(p: { start: string; end: string; notes: string | null }): string {
    const time = (iso: string) =>
      new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    const hasTimes = [p.start, p.end].some((iso) => {
      const d = new Date(iso);
      return d.getHours() !== 0 || d.getMinutes() !== 0;
    });
    let range: string;
    if (formatDate(p.start) === formatDate(p.end)) {
      range = hasTimes
        ? `${formatDate(p.start)}, ${time(p.start)}–${time(p.end)} Uhr`
        : formatDate(p.start);
    } else {
      range = hasTimes
        ? `${formatDate(p.start)} ${time(p.start)} – ${formatDate(p.end)} ${time(p.end)}`
        : `${formatDate(p.start)} – ${formatDate(p.end)}`;
    }
    return p.notes ? `${range} (${p.notes})` : range;
  }

  // ----- Zumietungen -----
  // Verknüpfte Zumietungen: Menge je Gerät (markiert die Geräte-Zeile blau).
  const subhireQtyByDevice = new Map<string, number>();
  // Verknüpfte Zumietungen: Menge je Ad-hoc-Position (markiert deren Zeile blau).
  const subhireQtyByAdHoc = new Map<string, number>();
  // Freie Zumietungen (nur Gruppe, keine Verknüpfung): eigene blaue Zeile.
  const freeSubhiresByGroup = new Map<string, SubhireVM[]>();
  for (const s of subhires) {
    if (s.deviceId) {
      subhireQtyByDevice.set(
        s.deviceId,
        (subhireQtyByDevice.get(s.deviceId) ?? 0) + s.quantity
      );
    } else if (s.adHocItemId) {
      subhireQtyByAdHoc.set(
        s.adHocItemId,
        (subhireQtyByAdHoc.get(s.adHocItemId) ?? 0) + s.quantity
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
  const adHocItemOptions = adHocItems.map((it) => ({ id: it.id, name: it.name }));

  function handleDeleteSubhire() {
    if (!subhireDelete) return;
    const id = subhireDelete.id;
    startTransition(async () => {
      try {
        await removeSubhire(id);
        toast.success("Zumietung entfernt");
        setSubhireDelete(null);
      } catch (e) {
        toastError(e, "Löschen");
      }
    });
  }
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [conflictPrompt, setConflictPrompt] = useState<ConflictPrompt | null>(null);

  // Aktive Gruppe (für neu hinzugefügte Geräte UND Kabel)
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
    billable: boolean;
    // Zugeordnete Berechnungszeiträume (leer = alle)
    billingPeriodIds: string[];
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
          toastError(e, "Anlegen");
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
        toastError(e, "Anlegen");
      }
    });
  }

  function handleQtyChange(assignmentId: string, q: number) {
    if (q < 1) return;
    startTransition(async () => {
      try {
        await updateAssignmentQuantity(project.id, assignmentId, q);
      } catch (e) {
        toastError(e, "Speichern");
      }
    });
  }

  function handleRemove(assignmentId: string) {
    startTransition(async () => {
      try {
        await removeAssignment(project.id, assignmentId);
        toast.success("Gerät entfernt");
      } catch (e) {
        toastError(e, "Löschen");
      }
    });
  }

  function handleMoveToGroup(assignmentId: string, groupId: string) {
    startTransition(async () => {
      try {
        await moveAssignmentToGroup(project.id, assignmentId, groupId);
      } catch (e) {
        toastError(e, "Verschieben");
      }
    });
  }

  // ----- Kabel-Buchungen -----
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
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.cableType ?? "").toLowerCase().includes(q) ||
      (c.connectorA ?? "").toLowerCase().includes(q) ||
      (c.connectorB ?? "").toLowerCase().includes(q) ||
      (c.description ?? "").toLowerCase().includes(q)
    );
  });

  async function handleAddCable(cableId: string) {
    // Kabel landen in derselben aktiven Material-Gruppe wie Geräte. Ist noch
    // gar keine Gruppe da, wird — wie bei Geräten — eine Standardgruppe angelegt.
    let groupId = activeGroupId;
    if (!groupId && groups.length === 0) {
      try {
        const res = await createProjectGroup(project.id, {
          name: "Material",
          kind: "MATERIAL",
        });
        groupId = res.id;
        setActiveGroupId(res.id);
      } catch (e) {
        toastError(e, "Anlegen");
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
        toastError(e, "Anlegen");
      }
    });
  }

  function handleCableQtyChange(assignmentId: string, q: number) {
    if (q < 1) return;
    startTransition(async () => {
      try {
        await updateCableAssignmentQuantity(project.id, assignmentId, q);
      } catch (e) {
        toastError(e, "Speichern");
      }
    });
  }

  function handleRemoveCable(assignmentId: string) {
    startTransition(async () => {
      try {
        await removeCableAssignment(project.id, assignmentId);
        toast.success("Kabel entfernt");
      } catch (e) {
        toastError(e, "Löschen");
      }
    });
  }

  function handleMoveCableToGroup(assignmentId: string, groupId: string) {
    startTransition(async () => {
      try {
        await moveCableAssignmentToGroup(project.id, assignmentId, groupId);
      } catch (e) {
        toastError(e, "Verschieben");
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
            billable: groupDialog.billable,
            billingPeriodIds: groupDialog.billingPeriodIds,
          });
        } else if (groupDialog.id) {
          await updateProjectGroup(groupDialog.id, {
            name,
            billable: groupDialog.billable,
            billingPeriodIds: groupDialog.billingPeriodIds,
          });
        }
        setGroupDialog(null);
      } catch (e) {
        toastError(e, "Speichern");
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
        toastError(e, "Löschen");
      }
    });
  }

  // ----- Redesign: Inline-Umbenennen, Gruppen-Reihenfolge, Zwischenüberschriften -----
  function handleRenameGroup(id: string, name: string) {
    startTransition(async () => {
      try {
        await renameProjectGroup(id, name);
      } catch (e) {
        toastError(e, "Speichern");
      }
    });
  }

  function handleMoveGroup(list: ProjectGroup[], index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    const ids = list.map((g) => g.id);
    [ids[index], ids[j]] = [ids[j], ids[index]];
    startTransition(async () => {
      try {
        await reorderProjectGroups(ids);
      } catch (e) {
        toastError(e, "Verschieben");
      }
    });
  }

  function handleAddNote(groupId: string) {
    startTransition(async () => {
      try {
        await addGroupComment(project.id, groupId, "Zwischenüberschrift");
      } catch (e) {
        toastError(e, "Anlegen");
      }
    });
  }

  function handleSaveNote(id: string, text: string) {
    startTransition(async () => {
      try {
        await updateGroupComment(id, text);
      } catch (e) {
        toastError(e, "Speichern");
      }
    });
  }

  function handleDeleteNote(id: string) {
    startTransition(async () => {
      try {
        await deleteGroupComment(id);
      } catch (e) {
        toastError(e, "Löschen");
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

  // Packliste/Digital-Packen brauchen mindestens eine gebuchte Position —
  // Kabel alleine reichen dafür aus.
  const hasPackableItems =
    project.assignments.length > 0 || cableAssignments.length > 0;

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

  /**
   * Geräte + Kabel + AdHoc + Comments einer Gruppe als geordnete Liste
   * (für DnD und Render). Alle Typen teilen sich den sortOrder-Raum der Gruppe.
   */
  function buildGroupRows(groupId: string): GroupRow[] {
    const out: GroupRow[] = [];
    for (const a of assignmentsByGroup.get(groupId) ?? []) {
      out.push({ sortId: `DEVICE:${a.id}`, kind: "DEVICE", id: a.id, sortOrder: a.sortOrder ?? 0 });
    }
    for (const ca of cableAssignmentsByGroup.get(groupId) ?? []) {
      out.push({ sortId: `CABLE:${ca.id}`, kind: "CABLE", id: ca.id, sortOrder: ca.sortOrder ?? 0 });
    }
    for (const it of adHocByGroup.get(groupId) ?? []) {
      out.push({ sortId: `ADHOC:${it.id}`, kind: "ADHOC", id: it.id, sortOrder: it.sortOrder ?? 0 });
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
        toastError(err, "Verschieben");
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
        toastError(e, "Speichern");
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
        toastError(e, "Löschen");
      }
    });
  }

  /** Rendert eine sortierbare AdHoc-Zeile in der Geräte-Tabelle (gelb, bei
   *  Zumietung blau hinterlegt). */
  function renderAdHocRow(it: ProjectAdHocItem, sortId: string) {
    const unit = Number(it.unitPrice);
    const line = unit * it.quantity * factorFor(it.groupId);
    const subhiredQty = subhireQtyByAdHoc.get(it.id) ?? 0;
    const hasSubhire = subhiredQty > 0;
    return (
      <SortableRow
        id={sortId}
        key={sortId}
        className={cn(
          hasSubhire
            ? "bg-subhire-subtle hover:bg-subhire-subtle"
            : "bg-warning-subtle hover:bg-warning-subtle"
        )}
      >
        <DragHandleCell />
        <TableCell>
          {/* AdHoc-Name einzeilig — Beschreibung wandert in eigene Spalte
              parallel zur Geräte-Tabellenstruktur. */}
          <div className="font-medium truncate">{it.name}</div>
          {it.description?.trim() && (
            <div className="text-[11px] text-muted-foreground truncate">
              {it.description}
            </div>
          )}
          {hasSubhire && (
            <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-subhire">
              <HandCoins className="h-3 w-3" />
              zugemietet: {subhiredQty} Stk.
            </div>
          )}
        </TableCell>
        <TableCell className="text-center">
          <QtyStepper
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
                  toastError(e, "Speichern");
                }
              })
            }
            disabled={pending}
          />
        </TableCell>
        {!isSale && (
          <TableCell className="num text-right text-xs text-muted-foreground whitespace-nowrap">
            {daysFor(it.groupId)} ({String(factorFor(it.groupId)).replace(".", ",")})
          </TableCell>
        )}
        <TableCell className="text-right num text-sm">
          {formatCurrency(unit)}
        </TableCell>
        <TableCell className="text-right num text-sm font-medium">
          {formatCurrency(line)}
        </TableCell>
        {!isSale && <TableCell />}
        <TableCell>
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="iconXs"
              className={cn(hasSubhire && "text-subhire")}
              onClick={() =>
                setSubhireDialog(
                  emptySubhire({
                    adHocItemId: it.id,
                    name: it.name,
                    quantity: it.quantity,
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
              size="iconXs"
              
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
              size="iconXs"
              className="text-destructive hover:text-destructive"
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
    const lineTotal = rate * a.quantity * factorFor(a.groupId);
    return (
      <Fragment key={sortId}>
        <SortableRow
          id={sortId}
          className={cn(
            // Zugemietet → blau (dominiert die Warnung optisch).
            hasSubhire &&
              "bg-subhire-subtle hover:bg-subhire-subtle",
            !hasSubhire &&
              showOverWarning &&
              "bg-destructive-subtle/70 hover:bg-destructive-subtle"
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
                  {a.device.description?.trim() && (
                    <div className="text-[11px] text-muted-foreground truncate">
                      {a.device.description}
                    </div>
                  )}
                  {hasSubhire && (
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-subhire">
                      <HandCoins className="h-3 w-3" />
                      zugemietet: {subhiredQty} Stk.
                    </div>
                  )}
                </>
              );
            })()}
          </TableCell>
          <TableCell className="text-center">
            <QtyStepper
              value={a.quantity}
              onChange={(v) => handleQtyChange(a.id, v)}
              disabled={pending}
              invalid={showOverWarning}
            />
          </TableCell>
          {!isSale && (
            <TableCell className="num text-right text-xs text-muted-foreground whitespace-nowrap">
              {daysFor(a.groupId)} ({String(factorFor(a.groupId)).replace(".", ",")})
            </TableCell>
          )}
          <TableCell className="text-right num text-sm">
            {formatCurrency(rate)}
          </TableCell>
          <TableCell className="text-right num text-sm font-medium">
            {formatCurrency(lineTotal)}
          </TableCell>
          {!isSale && (
            <TableCell>
              {isReserved ? (
                <span className="text-xs font-medium text-success">gebucht</span>
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
                size="iconXs"
                className={cn(hasSubhire && "text-subhire")}
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
                size="iconXs"
                
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
              <TableCell colSpan={isSale ? 6 : 8} className="py-1.5 text-xs text-destructive">
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
        className="bg-subhire-subtle hover:bg-subhire-subtle"
      >
        <TableCell />
        <TableCell>
          <div className="font-medium truncate">{s.name}</div>
          <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-subhire">
            <HandCoins className="h-3 w-3" />
            zugemietet{s.supplier ? ` · ${s.supplier}` : ""}
          </div>
        </TableCell>
        <TableCell className="text-center num text-sm">
          {s.quantity}
        </TableCell>
        {!isSale && (
          <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
        )}
        <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
        <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
        {!isSale && (
          <TableCell>
            <span className="text-xs font-medium text-subhire">
              zugemietet
            </span>
          </TableCell>
        )}
        <TableCell>
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="iconXs"
              
              title="Bearbeiten"
              onClick={() =>
                setSubhireDialog({
                  id: s.id,
                  deviceId: s.deviceId,
                  adHocItemId: s.adHocItemId,
                  groupId: s.groupId,
                  costGroupId: s.costGroupId,
                  name: s.name,
                  supplier: s.supplier ?? "",
                  quantity: s.quantity,
                  unitCost: s.unitCost,
                  notes: s.notes ?? "",
                })
              }
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="iconXs"
              className="text-destructive hover:text-destructive"
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
              "bg-destructive-subtle/70 hover:bg-destructive-subtle"
          )}
        >
          <DragHandleCell />
          <TableCell>
            <div className={cn("font-medium", isOver && "text-destructive")}>
              {ca.cable.name}
            </div>
            {/* Typ + Länge + Steckerenden — sonst ist nicht erkennbar,
                welches Kabel genau gebucht ist. */}
            {(ca.cable.cableType || cableSpecLabel(ca.cable)) && (
              <div className="text-[11px] text-muted-foreground">
                {[ca.cable.cableType, cableSpecLabel(ca.cable)]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}
          </TableCell>
          <TableCell className="text-center">
            <QtyStepper
              value={ca.quantity}
              onChange={(v) => handleCableQtyChange(ca.id, v)}
              disabled={pending}
              invalid={isOver}
            />
          </TableCell>
          {!isSale && (
            <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
          )}
          <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
          <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
          {!isSale && (
            <TableCell>
              <span className="text-xs text-muted-foreground">—</span>
            </TableCell>
          )}
          <TableCell>
            <div className="flex items-center justify-end gap-1">
              {groups.length > 1 && (
                <Select
                  value={ca.groupId}
                  onValueChange={(v) => handleMoveCableToGroup(ca.id, v)}
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
                size="iconXs"
                
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
            <TableCell colSpan={isSale ? 6 : 8} className="py-1.5 text-xs text-destructive">
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

  /** Zwischenüberschrift-Zeile (Redesign): inline editierbar. colSpan = Spalten − 2. */
  function renderCommentRow(c: ProjectGroupComment, sortId: string, colSpan: number) {
    return (
      <SortableRow id={sortId} key={sortId}>
        <DragHandleCell />
        <NoteRowCells
          text={c.text}
          colSpan={colSpan}
          pending={pending}
          onSave={(txt) => handleSaveNote(c.id, txt)}
          onDelete={() => handleDeleteNote(c.id)}
        />
      </SortableRow>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-end gap-2">
        {/* Inline-Änderungen (Mengen, Gruppennamen, Zwischenüberschriften)
            speichern sofort — der Indikator macht das sichtbar. */}
        <AutoSaveIndicator status={saveStatus} className="mr-auto" />
        <ScanDialog
          projectId={project.id}
          hasAssignments={hasPackableItems}
          packedCount={scanProgress.packed}
          totalCount={scanProgress.total}
        />
        {/* Lieferschein: gleiche Positionen wie die Packliste, aber als
            Kundendokument im CI (Briefpapier, Empfängeranschrift, Unterschrift). */}
        <DocumentDownloadButton
          href={`/api/projects/${project.id}/lieferschein/pdf?download=1`}
          label="Lieferschein"
          title="Lieferschein herunterladen"
          enabled={hasPackableItems}
          variant="outline"
        />
        <DocumentDownloadButton
          href={`/api/projects/${project.id}/packlist.pdf?download=1`}
          label="Packliste"
          title="Packliste herunterladen"
          enabled={hasPackableItems}
        />
      </div>
      {/* Auf Desktop wird die Card auf Viewport-Höhe begrenzt (abzüglich des
          52px-Headers + Abstände) und clippt intern. So kann die Seite nicht
          so weit scrollen, dass die Katalog-Suche hinter dem App-Header
          verschwindet — stattdessen scrollen Katalog und "zugewiesen"-Tabelle
          jeweils in ihrer eigenen Spalte. */}
      <Card className="flex flex-col lg:max-h-[calc(100vh-80px)] lg:overflow-hidden">
      <CardContent className="flex min-h-0 flex-1 flex-col p-4">
      <HorizontalSplit
        storageKey="devo:material-split"
        defaultLeftPx={360}
        minLeftPx={280}
        minRightPx={520}
        className="lg:min-h-0 lg:flex-1 lg:items-stretch"
        leftClassName="lg:flex lg:flex-col lg:min-h-0"
        rightClassName="lg:flex lg:flex-col lg:min-h-0"
        left={
          <div className="flex flex-col lg:flex-1 lg:min-h-0">
            <div className="space-y-3 pb-3">
              <CardTitle className="flex items-center gap-2">
                <Package className="h-4 w-4" /> Katalog
              </CardTitle>
              <FilterSearch
                grow
                value={search}
                onChange={setSearch}
                placeholder="Gerät oder Kabel suchen…"
              />
            </div>
            <div className="rounded-lg border lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
              <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <span className="flex-1">Bezeichnung</span>
                <span className="w-10 text-right">Bestand</span>
                <span className="w-7" />
              </div>
              {availableDevices.length === 0 && availableCables.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {allDevices.length === 0 && allCables.length === 0
                    ? "Noch keine Geräte oder Kabel angelegt"
                    : "Keine Treffer"}
                </p>
              ) : (
                <ul className="divide-y">
                  {groupItemsByCategory(availableDevices, categories).map((catGroup) => {
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
                                  <div className="flex-1 min-w-0">
                                    <div className="truncate text-sm font-medium">
                                      {d.name}
                                    </div>
                                  </div>
                                  <span className="shrink-0 num text-[11px] text-muted-foreground">
                                    {remainingStock}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="iconXs"
                                    className="shrink-0 opacity-60 group-hover:opacity-100"
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

                  {/* Kabel — eigener Ordner am Ende des Katalogs */}
                  <li key="__cables__">
                    <button
                      type="button"
                      className="flex w-full items-center gap-1.5 bg-muted/50 px-3 py-2 text-left text-xs font-semibold hover:bg-muted"
                      onClick={() => toggleCat("__cables__")}
                    >
                      {collapsedCats.has("__cables__") ? (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <CableIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate flex-1">Kabel</span>
                      {availableCables.length > 0 && (
                        <span className="shrink-0 text-muted-foreground font-normal">
                          {availableCables.length}
                        </span>
                      )}
                    </button>
                    {!collapsedCats.has("__cables__") && (
                      <ul className="divide-y">
                        {availableCables.length === 0 && (
                          <li className="px-6 py-2 text-xs text-muted-foreground">
                            {allCables.length === 0 ? "Noch keine Kabel angelegt" : "Keine Treffer"}
                          </li>
                        )}
                        {availableCables.map((c) => {
                          const conf = cableConflictMap[c.id];
                          const reserved = conf?.packAllocation ?? 0;
                          const bookedQty = bookedQtyByCable.get(c.id) ?? 0;
                          const free = Math.max(
                            0,
                            c.stockQuantity - reserved - bookedQty,
                          );
                          return (
                            <li
                              key={c.id}
                              className="group flex items-center gap-2 pl-6 pr-2 py-1 hover:bg-accent/40"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="truncate text-sm font-medium">{c.name}</div>
                                {(c.cableType || c.lengthMeters != null) && (
                                  <div className="truncate text-[11px] text-muted-foreground">
                                    {[
                                      c.cableType,
                                      c.lengthMeters != null
                                        ? `${Number(c.lengthMeters)} m`
                                        : null,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </div>
                                )}
                              </div>
                              <span className={cn(
                                "num shrink-0 text-[11px]",
                                free <= 0 ? "text-destructive font-semibold" : "text-muted-foreground",
                              )}>
                                {free} frei
                              </span>
                              <Button
                                variant="ghost"
                                size="iconXs"
                                className="shrink-0 opacity-60 group-hover:opacity-100"
                                disabled={pending}
                                onClick={() => handleAddCable(c.id)}
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
                </ul>
              )}
            </div>
          </div>
        }
        right={
          <div className="flex flex-col lg:flex-1 lg:min-h-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-0.5">
              <div className="text-xs text-muted-foreground">
                <span className="font-bold text-foreground">
                  {project.assignments.reduce((s, a) => s + a.quantity, 0)} Stück
                </span>{" "}
                zugewiesen
                {cableAssignments.length > 0 && (
                  <> · {cableAssignments.length} Kabeltypen</>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
                  <Plus className="h-4 w-4" /> Vorübergehendes Gerät
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
            </div>

            {/* EINE durchgehende Tabelle: Material-Gruppen mit Geräten, Kabeln
                und Ad-hoc-Positionen gemischt. */}
            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card lg:flex-1">
              <div className="min-h-0 flex-1 overflow-y-auto">
                {groups.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    <p>Noch keine Gruppen — beim ersten Buchen wird automatisch eine angelegt.</p>
                  </div>
                ) : (
                  <Table density="dense">
                    <TableHeader>
                      <TableRow className="hover:bg-secondary">
                        <TableHead className="w-8"></TableHead>
                        <TableHead>Gerät / Kabel</TableHead>
                        <TableHead className="w-[110px] text-center">Anzahl</TableHead>
                        {!isSale && <TableHead className="w-[96px] text-right">Tage (Faktor)</TableHead>}
                        <TableHead className="w-[96px] text-right">
                          {isSale ? "€ / Stück" : "€ / Tag"}
                        </TableHead>
                        <TableHead className="w-[110px] text-right">Summe</TableHead>
                        {!isSale && <TableHead className="w-[76px]">Status</TableHead>}
                        <TableHead className="w-[110px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    {groups.map((g, gi) => {
                      const mainRows = buildGroupRows(g.id);
                      const freeSubs = freeSubhiresByGroup.get(g.id) ?? [];
                      const groupAssignments = assignmentsByGroup.get(g.id) ?? [];
                      const groupCables = cableAssignmentsByGroup.get(g.id) ?? [];
                      const colSpanAll = isSale ? 6 : 8;
                      const groupSum =
                        groupAssignments.reduce(
                          (s, a) => s + Number(a.device.dailyRate) * a.quantity * factorFor(g.id),
                          0
                        ) +
                        (adHocByGroup.get(g.id) ?? []).reduce(
                          (s, it) => s + Number(it.unitPrice) * it.quantity * factorFor(g.id),
                          0
                        );
                      return (
                        <DndContext
                          key={g.id}
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(e) => handleDragEnd(mainRows, e)}
                        >
                          <TableBody>
                            <GroupHeaderRow
                              group={g}
                              colSpan={colSpanAll}
                              sumLabel={formatCurrency(groupSum)}
                              active={activeGroupId === g.id}
                              isFirst={gi === 0}
                              isLast={gi === groups.length - 1}
                              pending={pending}
                              onActivate={() => setActiveGroupId(g.id)}
                              onRename={(name) => handleRenameGroup(g.id, name)}
                              onMoveUp={() => handleMoveGroup(groups, gi, -1)}
                              onMoveDown={() => handleMoveGroup(groups, gi, 1)}
                              onAddNote={() => handleAddNote(g.id)}
                              onEdit={() =>
                                setGroupDialog({
                                  mode: "rename",
                                  id: g.id,
                                  name: g.name,
                                  billable: g.billable,
                                  billingPeriodIds: groupPeriodIds[g.id] ?? [],
                                })
                              }
                              onDelete={() => setDeleteGroup(g)}
                            />
                            {mainRows.length === 0 && freeSubs.length === 0 && (
                              <TableRow>
                                <TableCell
                                  colSpan={colSpanAll}
                                  className="py-3 text-center text-xs text-muted-foreground"
                                >
                                  Noch nichts in dieser Gruppe — Gerät oder Kabel im Katalog
                                  anklicken (Pfeil-Button), es landet in der aktiven Gruppe.
                                </TableCell>
                              </TableRow>
                            )}
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
                                  return renderCommentRow(c, r.sortId, colSpanAll - 2);
                                }
                                if (r.kind === "ADHOC") {
                                  const it = (adHocByGroup.get(g.id) ?? []).find(
                                    (x) => x.id === r.id
                                  );
                                  if (!it) return null;
                                  return renderAdHocRow(it, r.sortId);
                                }
                                if (r.kind === "CABLE") {
                                  const ca = groupCables.find((x) => x.id === r.id);
                                  if (!ca) return null;
                                  return renderCableRow(ca, r.sortId);
                                }
                                const a = groupAssignments.find((x) => x.id === r.id);
                                if (!a) return null;
                                return renderDeviceRow(a, r.sortId);
                              })}
                            </SortableContext>
                            {freeSubs.map((s) => renderFreeSubhireRow(s))}
                          </TableBody>
                        </DndContext>
                      );
                    })}
                  </Table>
                )}
              </div>
              <GroupTableFooter
                onAddGroup={() =>
                  setGroupDialog({
                    mode: "create",
                    name: "",
                    billable: true,
                    billingPeriodIds: [],
                  })
                }
                pending={pending}
              >
                {discount > 0 && (
                  <span>
                    Rabatte{" "}
                    <span className="num">−{formatCurrency(discount)}</span>
                  </span>
                )}
                {!isSale && (
                  <span>
                    {billingDays} Tag(e) · Faktor ×{billingFactor.toFixed(2)}
                  </span>
                )}
                <span>Netto Material</span>
                <span className="font-mono text-sm font-extrabold text-primary">
                  {formatCurrency(total)}
                </span>
              </GroupTableFooter>
            </div>
          </div>
        }
      />
      </CardContent>
      </Card>

      {/* Gruppe-Dialog */}
      <Dialog
        open={groupDialog !== null}
        onOpenChange={(o) => !o && setGroupDialog(null)}
      >
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>
              {groupDialog?.mode === "create" ? "Gruppe anlegen" : "Gruppe bearbeiten"}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-1.5">
              Gruppen sind nur für dieses Projekt — z.B. „Ton", „Licht", „Bühne".
              <InfoHint text="Gebuchte Kabel erscheinen nie auf Angeboten oder Rechnungen — nur auf der Packliste." />
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
            <div className="flex items-center gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={groupDialog?.billable ?? true}
                  onChange={(e) =>
                    setGroupDialog((g) =>
                      g ? { ...g, billable: e.target.checked } : g
                    )
                  }
                  className="h-4 w-4 rounded border-input"
                />
                <span className="font-medium">Abrechenbar</span>
              </label>
              <InfoHint text="Wenn deaktiviert, taucht diese Gruppe nicht auf Angeboten oder Rechnungen auf und fließt nicht in Gesamtsummen ein." />
            </div>
            {billingPeriods.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <label className="text-sm font-medium">Berechnungszeiträume</label>
                  <InfoHint text="Der Mietpreis dieser Gruppe wird nur über die gewählten Zeiträume berechnet (Tagesfaktor). Keine Auswahl = alle Zeiträume. So lässt sich z.B. ein Aufbautag von der Materialberechnung ausnehmen." />
                </div>
                <div className="space-y-1 rounded-md border p-2">
                  {billingPeriods.map((p) => {
                    const checked =
                      groupDialog?.billingPeriodIds.includes(p.id) ?? false;
                    return (
                      <label key={p.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setGroupDialog((g) => {
                              if (!g) return g;
                              const ids = e.target.checked
                                ? [...g.billingPeriodIds, p.id]
                                : g.billingPeriodIds.filter((x) => x !== p.id);
                              return { ...g, billingPeriodIds: ids };
                            })
                          }
                          className="h-4 w-4 rounded border-input"
                        />
                        {periodLabel(p)}
                      </label>
                    );
                  })}
                </div>
              </div>
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
        <DialogContent size="sm">
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
        adHocItems={adHocItemOptions}
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
