"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { InfoHint } from "@/components/ui/info-hint";
import {
  HandCoins,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Link2,
  Users,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import type { EmploymentType, ExtraCostKind } from "@prisma/client";
import { formatCurrency } from "@/lib/utils";
import {
  employmentTypeLabel,
  employmentTypeVariant,
  extraCostKindLabel,
} from "@/lib/labels";
import { formatMinutes } from "@/lib/personnel-costs";
import { Badge } from "@/components/ui/badge";
import {
  GroupHeaderRow,
  NoteRowCells,
  QtyStepper,
  GroupTableFooter,
  FooterDashedButton,
} from "@/components/project/group-table";
import {
  SubhireDialog,
  emptySubhire,
  type SubhireFormValue,
} from "./subhire-dialog";
import {
  removeSubhire,
  updateSubhireQuantity,
  moveSubhireToCostGroup,
  addExtraCost,
  updateExtraCost,
  removeExtraCost,
  moveExtraCostToGroup,
} from "./costs-actions";
import {
  createProjectGroup,
  renameProjectGroup,
  reorderProjectGroups,
  deleteProjectGroup,
} from "./groups-actions";
import {
  reorderGroupItems,
  addGroupComment,
  updateGroupComment,
  deleteGroupComment,
  type GroupItemKind,
} from "./group-items-actions";
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

/** Icon je Extrakosten-Kategorie — gleiche Icons wie auf „Personal & Transport". */
function extraCostKindIcon(kind: ExtraCostKind) {
  return kind === "PERSONAL" ? Users : Package;
}

export interface SubhireVM {
  id: string;
  deviceId: string | null;
  adHocItemId: string | null;
  groupId: string | null;
  costGroupId: string | null;
  costSortOrder: number;
  name: string;
  supplier: string | null;
  quantity: number;
  unitCost: number;
  notes: string | null;
}

export interface ExtraCostVM {
  id: string;
  groupId: string | null;
  sortOrder: number;
  label: string;
  kind: ExtraCostKind;
  amount: number;
  notes: string | null;
}

export interface CostGroupVM {
  id: string;
  name: string;
  billable: boolean;
}

export interface CostGroupCommentVM {
  id: string;
  groupId: string;
  text: string;
  sortOrder: number;
}

type CostGroupKind = "SUBHIRE" | "EXTRA";

interface Props {
  projectId: string;
  subhires: SubhireVM[];
  extraCosts: ExtraCostVM[];
  devices: { id: string; name: string; manufacturer: string | null; model: string | null }[];
  adHocItems: { id: string; name: string }[];
  /** Material-Gruppen — nur für die Platzierung freier Zumietungen im SubhireDialog. */
  materialGroups: { id: string; name: string }[];
  /** Gruppen der Kosten-Seite. */
  subhireGroups: CostGroupVM[];
  extraGroups: CostGroupVM[];
  groupComments: CostGroupCommentVM[];
  /** Personalkosten aus dem Einsatzplan (read-only, Pflege im Personal-Tab). */
  personnelCost: number;
  /** Einsatzplan-Zeilen (read-only): pro Einsatz Person, Position, Vergütung. */
  personnelEntries: PersonnelEntryVM[];
  /** Erfasste Zeiten ohne Einsatz (z.B. nach Positions-Löschung). */
  orphanTime: { minutes: number; cost: number };
}

export interface PersonnelEntryVM {
  id: string;
  personName: string;
  employmentType: EmploymentType;
  serviceName: string;
  /** Pauschale/Tagessatz (gesamt) — direkt kostenwirksam. */
  agreedRate: number | null;
  /** Stundensatz — Kosten entstehen über erfasste Zeiten. */
  hourlyRate: number | null;
  /** Stundenlohn aus dem Personalstamm (Minijobber). */
  personHourlyWage: number | null;
  loggedMinutes: number;
  /** Ist-Kosten aus erfassten Zeiten (Stunden × Lohn-Snapshot). */
  timeCost: number;
  /** Geplante Minuten aus dem effektiven Zeitfenster. */
  plannedMinutes: number;
  /** Effektive Stunden/Kosten (Pauschale > Ist > geplant); planned = Vorschau. */
  effMinutes: number;
  effCost: number;
  effPlanned: boolean;
}

type ExtraDialogState = {
  id?: string;
  groupId: string | null;
  label: string;
  kind: ExtraCostKind;
  amount: number;
  notes: string;
} | null;

type GroupDialogState = { kind: CostGroupKind; name: string } | null;

type DeleteGroupState = { id: string; name: string; kind: CostGroupKind } | null;

/** Spaltenzahl der durchgehenden Tabelle. */
const COL_SPAN_ALL = 6;

export function CostsSection({
  projectId,
  subhires,
  extraCosts,
  devices,
  adHocItems,
  materialGroups,
  subhireGroups,
  extraGroups,
  groupComments,
  personnelCost,
  personnelEntries,
  orphanTime,
}: Props) {
  const [pending, startTransition] = useTransition();

  // ----- Dialog-/Lösch-State -----
  const [subhireDialog, setSubhireDialog] = useState<SubhireFormValue | null>(null);
  const [subhireDelete, setSubhireDelete] = useState<SubhireVM | null>(null);
  const [extraDialog, setExtraDialog] = useState<ExtraDialogState>(null);
  const [extraDelete, setExtraDelete] = useState<ExtraCostVM | null>(null);
  const [groupDialog, setGroupDialog] = useState<GroupDialogState>(null);
  const [deleteGroup, setDeleteGroup] = useState<DeleteGroupState>(null);

  // ----- Aktive Gruppen (Ziel neuer Positionen) -----
  const [activeSubhireGroupId, setActiveSubhireGroupId] = useState<string | null>(
    subhireGroups[0]?.id ?? null
  );
  useEffect(() => {
    if (!activeSubhireGroupId && subhireGroups[0]) {
      setActiveSubhireGroupId(subhireGroups[0].id);
    }
    if (
      activeSubhireGroupId &&
      !subhireGroups.find((g) => g.id === activeSubhireGroupId)
    ) {
      setActiveSubhireGroupId(subhireGroups[0]?.id ?? null);
    }
  }, [subhireGroups, activeSubhireGroupId]);

  const [activeExtraGroupId, setActiveExtraGroupId] = useState<string | null>(
    extraGroups[0]?.id ?? null
  );
  useEffect(() => {
    if (!activeExtraGroupId && extraGroups[0]) {
      setActiveExtraGroupId(extraGroups[0].id);
    }
    if (activeExtraGroupId && !extraGroups.find((g) => g.id === activeExtraGroupId)) {
      setActiveExtraGroupId(extraGroups[0]?.id ?? null);
    }
  }, [extraGroups, activeExtraGroupId]);

  // ----- Ableitungen -----
  const deviceNameById = new Map(devices.map((d) => [d.id, d.name]));
  const adHocNameById = new Map(adHocItems.map((a) => [a.id, a.name]));
  function linkedName(s: SubhireVM): string | null {
    if (s.deviceId) return deviceNameById.get(s.deviceId) ?? null;
    if (s.adHocItemId) return adHocNameById.get(s.adHocItemId) ?? null;
    return null;
  }

  const subhireGroupIds = new Set(subhireGroups.map((g) => g.id));
  const extraGroupIds = new Set(extraGroups.map((g) => g.id));
  // Fallback: Positionen ohne (gültige) Gruppe — z.B. nach Löschen der letzten Gruppe.
  const ungroupedSubhires = subhires.filter(
    (s) => !s.costGroupId || !subhireGroupIds.has(s.costGroupId)
  );
  const ungroupedExtras = extraCosts.filter(
    (c) => !c.groupId || !extraGroupIds.has(c.groupId)
  );

  const commentsByGroup = new Map<string, CostGroupCommentVM[]>();
  for (const c of groupComments) {
    const arr = commentsByGroup.get(c.groupId) ?? [];
    arr.push(c);
    commentsByGroup.set(c.groupId, arr);
  }

  const subhireTotal = subhires.reduce((s, x) => s + x.unitCost * x.quantity, 0);
  const extraPersonal = extraCosts
    .filter((c) => c.kind === "PERSONAL")
    .reduce((s, c) => s + c.amount, 0);
  const extraOther = extraCosts
    .filter((c) => c.kind === "SONSTIGES")
    .reduce((s, c) => s + c.amount, 0);
  // Personalkosten aus dem Einsatzplan fließen mit in "Kosten gesamt" ein —
  // gepflegt werden sie im Tab Personal & Transport, hier nur Anzeige.
  const grandTotal = subhireTotal + extraPersonal + extraOther + personnelCost;

  const isEmpty =
    subhireGroups.length === 0 &&
    extraGroups.length === 0 &&
    subhires.length === 0 &&
    extraCosts.length === 0 &&
    personnelEntries.length === 0 &&
    orphanTime.minutes === 0;

  // ----- DnD -----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  type GroupRow = {
    sortId: string; // "SUBHIRE:abc", "EXTRA:xyz", "COMMENT:c1"
    kind: GroupItemKind;
    id: string;
    sortOrder: number;
  };

  function buildSubhireGroupRows(groupId: string): GroupRow[] {
    const out: GroupRow[] = [];
    for (const s of subhires) {
      if (s.costGroupId !== groupId) continue;
      out.push({
        sortId: `SUBHIRE:${s.id}`,
        kind: "SUBHIRE",
        id: s.id,
        sortOrder: s.costSortOrder,
      });
    }
    for (const c of commentsByGroup.get(groupId) ?? []) {
      out.push({ sortId: `COMMENT:${c.id}`, kind: "COMMENT", id: c.id, sortOrder: c.sortOrder });
    }
    return out.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  function buildExtraGroupRows(groupId: string): GroupRow[] {
    const out: GroupRow[] = [];
    for (const c of extraCosts) {
      if (c.groupId !== groupId) continue;
      out.push({ sortId: `EXTRA:${c.id}`, kind: "EXTRA", id: c.id, sortOrder: c.sortOrder });
    }
    for (const c of commentsByGroup.get(groupId) ?? []) {
      out.push({ sortId: `COMMENT:${c.id}`, kind: "COMMENT", id: c.id, sortOrder: c.sortOrder });
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
          projectId,
          ordered.map((r) => ({ kind: r.kind, id: r.id }))
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler beim Sortieren");
      }
    });
  }

  // ----- Gruppen-Handler -----
  function handleCreateGroup() {
    if (!groupDialog) return;
    const name = groupDialog.name.trim();
    if (!name) {
      toast.error("Name darf nicht leer sein");
      return;
    }
    startTransition(async () => {
      try {
        const res = await createProjectGroup(projectId, {
          name,
          kind: groupDialog.kind,
        });
        if (groupDialog.kind === "SUBHIRE") setActiveSubhireGroupId(res.id);
        else setActiveExtraGroupId(res.id);
        setGroupDialog(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleRenameGroup(id: string, name: string) {
    startTransition(async () => {
      try {
        await renameProjectGroup(id, name);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleMoveGroup(list: CostGroupVM[], index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    const ids = list.map((g) => g.id);
    [ids[index], ids[j]] = [ids[j], ids[index]];
    startTransition(async () => {
      try {
        await reorderProjectGroups(ids);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleDeleteGroup() {
    if (!deleteGroup) return;
    const { id, kind } = deleteGroup;
    // Enthaltene Positionen in die nächste verbleibende Gruppe desselben Typs
    // verschieben — Kostendaten dürfen beim Gruppenlöschen nicht verloren gehen.
    const remaining = (kind === "SUBHIRE" ? subhireGroups : extraGroups).filter(
      (g) => g.id !== id
    );
    const moveTo = remaining[0]?.id ?? null;
    startTransition(async () => {
      try {
        await deleteProjectGroup(id, moveTo);
        setDeleteGroup(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  // ----- Zwischenüberschriften -----
  function handleAddNote(groupId: string) {
    startTransition(async () => {
      try {
        await addGroupComment(projectId, groupId, "Zwischenüberschrift");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleSaveNote(id: string, text: string) {
    startTransition(async () => {
      try {
        await updateGroupComment(id, text);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleDeleteNote(id: string) {
    startTransition(async () => {
      try {
        await deleteGroupComment(id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  // ----- Zumietungen -----
  function handleSubhireQty(id: string, q: number) {
    if (q < 1) return;
    startTransition(async () => {
      try {
        await updateSubhireQuantity(id, q);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleMoveSubhire(id: string, groupId: string) {
    startTransition(async () => {
      try {
        await moveSubhireToCostGroup(id, groupId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

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

  // ----- Extrakosten -----
  function handleSaveExtra() {
    if (!extraDialog) return;
    const label = extraDialog.label.trim();
    if (!label) {
      toast.error("Bezeichnung darf nicht leer sein");
      return;
    }
    const payload = {
      label,
      groupId: extraDialog.groupId,
      kind: extraDialog.kind,
      amount: extraDialog.amount,
      notes: extraDialog.notes.trim() || null,
    };
    startTransition(async () => {
      try {
        if (extraDialog.id) {
          await updateExtraCost(extraDialog.id, payload);
          toast.success("Extrakosten gespeichert");
        } else {
          await addExtraCost(projectId, payload);
          toast.success("Extrakosten hinzugefügt");
        }
        setExtraDialog(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleMoveExtra(id: string, groupId: string) {
    startTransition(async () => {
      try {
        await moveExtraCostToGroup(id, groupId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleDeleteExtra() {
    if (!extraDelete) return;
    const id = extraDelete.id;
    startTransition(async () => {
      try {
        await removeExtraCost(id);
        toast.success("Extrakosten entfernt");
        setExtraDelete(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  // ----- Zeilen-Renderer -----
  function subhireDialogSeed(s: SubhireVM): SubhireFormValue {
    return {
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
    };
  }

  /** Aktions-Zellen (Gruppen-Select, Bearbeiten, Entfernen) einer Zeile. */
  function rowActions(opts: {
    groups: CostGroupVM[];
    currentGroupId: string | null;
    onMove: (groupId: string) => void;
    onEdit: () => void;
    onDelete: () => void;
  }) {
    return (
      <div className="flex items-center justify-end gap-1">
        {opts.groups.length > 1 && opts.currentGroupId && (
          <Select value={opts.currentGroupId} onValueChange={opts.onMove}>
            <SelectTrigger className="h-7 w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {opts.groups.map((og) => (
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
          title="Bearbeiten"
          onClick={opts.onEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          title="Entfernen"
          onClick={opts.onDelete}
          disabled={pending}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  /** Sortierbare Zumietungs-Zeile. `sortable=false` für den „Ohne Gruppe"-Fallback. */
  function renderSubhireRow(s: SubhireVM, sortId: string, sortable = true) {
    const cells = (
      <>
        <TableCell>
          <div className="font-medium truncate">{s.name}</div>
          {s.supplier?.trim() && (
            <div className="text-[11px] text-muted-foreground truncate">
              {s.supplier}
            </div>
          )}
          {(s.deviceId || s.adHocItemId) && (
            <div className="flex items-center gap-1 text-[11px] text-fuchsia-600 dark:text-fuchsia-400">
              <Link2 className="h-3 w-3" />
              verknüpft
              {linkedName(s) && linkedName(s) !== s.name && (
                <span className="text-muted-foreground">({linkedName(s)})</span>
              )}
            </div>
          )}
          {s.notes?.trim() && (
            <div className="text-[11px] text-muted-foreground truncate">{s.notes}</div>
          )}
        </TableCell>
        <TableCell className="text-center">
          <QtyStepper
            value={s.quantity}
            onChange={(v) => handleSubhireQty(s.id, v)}
            disabled={pending}
          />
        </TableCell>
        <TableCell className="text-right tabular-nums font-mono text-sm">
          {formatCurrency(s.unitCost)}
        </TableCell>
        <TableCell className="text-right tabular-nums font-mono text-sm font-medium">
          {formatCurrency(s.unitCost * s.quantity)}
        </TableCell>
        <TableCell>
          {rowActions({
            groups: subhireGroups,
            currentGroupId: s.costGroupId,
            onMove: (gid) => handleMoveSubhire(s.id, gid),
            onEdit: () => setSubhireDialog(subhireDialogSeed(s)),
            onDelete: () => setSubhireDelete(s),
          })}
        </TableCell>
      </>
    );
    if (!sortable) {
      return (
        <TableRow key={sortId} className="[&_td]:px-2 [&_td]:py-1">
          <TableCell />
          {cells}
        </TableRow>
      );
    }
    return (
      <SortableRow id={sortId} key={sortId} className="[&_td]:px-2 [&_td]:py-1">
        <DragHandleCell />
        {cells}
      </SortableRow>
    );
  }

  /** Sortierbare Extrakosten-Zeile. */
  function renderExtraRow(c: ExtraCostVM, sortId: string, sortable = true) {
    const KindIcon = extraCostKindIcon(c.kind);
    const cells = (
      <>
        <TableCell>
          <div className="flex items-center gap-2">
            <KindIcon
              className="h-4 w-4 text-muted-foreground shrink-0"
              aria-label={extraCostKindLabel(c.kind)}
            />
            <div className="min-w-0">
              <div className="font-medium truncate">{c.label}</div>
              {c.notes && (
                <div className="text-[11px] text-muted-foreground truncate">{c.notes}</div>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell className="text-center text-xs text-muted-foreground">—</TableCell>
        <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
        <TableCell className="text-right tabular-nums font-mono text-sm font-medium">
          {formatCurrency(c.amount)}
        </TableCell>
        <TableCell>
          {rowActions({
            groups: extraGroups,
            currentGroupId: c.groupId,
            onMove: (gid) => handleMoveExtra(c.id, gid),
            onEdit: () =>
              setExtraDialog({
                id: c.id,
                groupId: c.groupId,
                label: c.label,
                kind: c.kind,
                amount: c.amount,
                notes: c.notes ?? "",
              }),
            onDelete: () => setExtraDelete(c),
          })}
        </TableCell>
      </>
    );
    if (!sortable) {
      return (
        <TableRow key={sortId} className="[&_td]:px-2 [&_td]:py-1">
          <TableCell />
          {cells}
        </TableRow>
      );
    }
    return (
      <SortableRow id={sortId} key={sortId} className="[&_td]:px-2 [&_td]:py-1">
        <DragHandleCell />
        {cells}
      </SortableRow>
    );
  }

  /** Zwischenüberschrift-Zeile: inline editierbar. */
  function renderCommentRow(c: CostGroupCommentVM, sortId: string) {
    return (
      <SortableRow id={sortId} key={sortId}>
        <DragHandleCell />
        <NoteRowCells
          text={c.text}
          colSpan={COL_SPAN_ALL - 2}
          pending={pending}
          onSave={(txt) => handleSaveNote(c.id, txt)}
          onDelete={() => handleDeleteNote(c.id)}
        />
      </SortableRow>
    );
  }

  /** „Ohne Gruppe"-Kopfzeile für Fallback-Positionen. */
  function renderUngroupedHeader(key: string) {
    return (
      <TableRow key={key} className="border-t-2 border-t-accent bg-secondary hover:bg-secondary">
        <TableCell colSpan={COL_SPAN_ALL} className="px-2.5 py-1.5">
          <span className="text-xs font-bold uppercase tracking-[.04em] text-muted-foreground">
            Ohne Gruppe
          </span>
        </TableCell>
      </TableRow>
    );
  }

  /** Eine Gruppen-Sektion (Kopfzeile + sortierbare Zeilen) rendern. */
  function renderGroupSection(opts: {
    group: CostGroupVM;
    kind: CostGroupKind;
    list: CostGroupVM[];
    index: number;
    rows: GroupRow[];
    sumLabel: string;
    active: boolean;
    onActivate: () => void;
    emptyHint: string;
    renderRow: (row: GroupRow) => ReactNode;
  }) {
    const { group: g, kind, list, index, rows } = opts;
    return (
      <DndContext
        key={g.id}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(e) => handleDragEnd(rows, e)}
      >
        <TableBody>
          <GroupHeaderRow
            group={g}
            colSpan={COL_SPAN_ALL}
            sumLabel={opts.sumLabel}
            active={opts.active}
            isFirst={index === 0}
            isLast={index === list.length - 1}
            pending={pending}
            onActivate={opts.onActivate}
            onRename={(name) => handleRenameGroup(g.id, name)}
            onMoveUp={() => handleMoveGroup(list, index, -1)}
            onMoveDown={() => handleMoveGroup(list, index, 1)}
            onAddNote={() => handleAddNote(g.id)}
            onDelete={() => setDeleteGroup({ id: g.id, name: g.name, kind })}
          />
          {rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={COL_SPAN_ALL}
                className="py-3 text-center text-xs text-muted-foreground"
              >
                {opts.emptyHint}
              </TableCell>
            </TableRow>
          )}
          <SortableContext
            items={rows.map((r) => r.sortId)}
            strategy={verticalListSortingStrategy}
          >
            {rows.map((r) => opts.renderRow(r))}
          </SortableContext>
        </TableBody>
      </DndContext>
    );
  }

  return (
    // Auf Desktop wird die Card auf Viewport-Höhe begrenzt (abzüglich des
    // 52px-Headers + Abstände) und clippt intern, sodass die Kosten-Tabelle in
    // ihrer eigenen Fläche scrollt statt die ganze Seite wachsen zu lassen.
    <Card className="p-4 lg:flex lg:flex-col lg:max-h-[calc(100vh-80px)] lg:overflow-hidden">
      <div className="flex flex-col lg:min-h-0 lg:flex-1">
        {/* Kopfzeile: Summen links, Aktionen rechts. */}
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-0.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              <span className="font-bold text-foreground">
                {subhires.length} Zumietung(en)
              </span>{" "}
              · {extraCosts.length} Extrakosten-Position(en)
            </span>
            <InfoHint text="Rein interne Kosten — erscheinen nicht auf Angeboten, Rechnungen oder Packlisten und ändern die Planung nicht." />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setExtraDialog({
                  groupId: activeExtraGroupId,
                  label: "",
                  kind: "SONSTIGES",
                  amount: 0,
                  notes: "",
                })
              }
            >
              <Plus className="h-4 w-4" /> Extrakosten
            </Button>
            <Button
              size="sm"
              onClick={() =>
                setSubhireDialog(emptySubhire({ costGroupId: activeSubhireGroupId }))
              }
            >
              <HandCoins className="h-4 w-4" /> Zumietung hinzufügen
            </Button>
          </div>
        </div>

        {/* EINE durchgehende Tabelle: Zumietungs-Gruppen, danach Extrakosten-Gruppen. */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card lg:flex-1">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isEmpty ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <p>
                  Noch keine Kosten erfasst — beim ersten Hinzufügen wird automatisch
                  eine Gruppe angelegt.
                </p>
              </div>
            ) : (
              <Table className="[&_td]:px-2 [&_td]:py-1">
                <TableHeader>
                  <TableRow className="hover:bg-secondary">
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Bezeichnung</TableHead>
                    <TableHead className="w-[110px] text-center">Anzahl</TableHead>
                    <TableHead className="w-[96px] text-right">€ / Stück</TableHead>
                    <TableHead className="w-[110px] text-right">Summe</TableHead>
                    <TableHead className="w-[110px]"></TableHead>
                  </TableRow>
                </TableHeader>

                {/* Zumietungs-Gruppen */}
                {subhireGroups.map((g, gi) => {
                  const rows = buildSubhireGroupRows(g.id);
                  const sum = subhires
                    .filter((s) => s.costGroupId === g.id)
                    .reduce((acc, s) => acc + s.unitCost * s.quantity, 0);
                  return renderGroupSection({
                    group: g,
                    kind: "SUBHIRE",
                    list: subhireGroups,
                    index: gi,
                    rows,
                    sumLabel: formatCurrency(sum),
                    active: activeSubhireGroupId === g.id,
                    onActivate: () => setActiveSubhireGroupId(g.id),
                    emptyHint:
                      "Noch nichts in dieser Gruppe — über ‚Zumietung hinzufügen' landet die nächste Position in der aktiven Gruppe.",
                    renderRow: (r) => {
                      if (r.kind === "COMMENT") {
                        const c = (commentsByGroup.get(g.id) ?? []).find(
                          (x) => x.id === r.id
                        );
                        if (!c) return null;
                        return renderCommentRow(c, r.sortId);
                      }
                      const s = subhires.find((x) => x.id === r.id);
                      if (!s) return null;
                      return renderSubhireRow(s, r.sortId);
                    },
                  });
                })}
                {ungroupedSubhires.length > 0 && (
                  <TableBody>
                    {renderUngroupedHeader("__ungrouped_subhires__")}
                    {ungroupedSubhires.map((s) =>
                      renderSubhireRow(s, `SUBHIRE:${s.id}`, false)
                    )}
                  </TableBody>
                )}

                {/* Extrakosten-Gruppen */}
                {extraGroups.map((g, gi) => {
                  const rows = buildExtraGroupRows(g.id);
                  const sum = extraCosts
                    .filter((c) => c.groupId === g.id)
                    .reduce((acc, c) => acc + c.amount, 0);
                  return renderGroupSection({
                    group: g,
                    kind: "EXTRA",
                    list: extraGroups,
                    index: gi,
                    rows,
                    sumLabel: formatCurrency(sum),
                    active: activeExtraGroupId === g.id,
                    onActivate: () => setActiveExtraGroupId(g.id),
                    emptyHint:
                      "Noch nichts in dieser Gruppe — über ‚Extrakosten' landet die nächste Position in der aktiven Gruppe.",
                    renderRow: (r) => {
                      if (r.kind === "COMMENT") {
                        const c = (commentsByGroup.get(g.id) ?? []).find(
                          (x) => x.id === r.id
                        );
                        if (!c) return null;
                        return renderCommentRow(c, r.sortId);
                      }
                      const c = extraCosts.find((x) => x.id === r.id);
                      if (!c) return null;
                      return renderExtraRow(c, r.sortId);
                    },
                  });
                })}
                {ungroupedExtras.length > 0 && (
                  <TableBody>
                    {renderUngroupedHeader("__ungrouped_extras__")}
                    {ungroupedExtras.map((c) =>
                      renderExtraRow(c, `EXTRA:${c.id}`, false)
                    )}
                  </TableBody>
                )}

                {/* Personal (Einsatzplan) — read-only, Pflege im Personal-Tab. */}
                {(personnelEntries.length > 0 || orphanTime.minutes > 0) && (
                  <TableBody>
                    <TableRow className="bg-muted/40 hover:bg-muted/50">
                      <TableCell colSpan={COL_SPAN_ALL} className="py-2">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                          Personal (Einsatzplan)
                          <InfoHint text="Automatisch aus dem Einsatzplan (Tab Personal & Transport): Freelancer-Pauschalen direkt, Stunden-Vergütungen über die erfassten Zeiten. Hier nicht doppelt als Extrakosten erfassen." />
                        </div>
                      </TableCell>
                    </TableRow>
                    {personnelEntries.map((p) => (
                      <TableRow key={`personnel:${p.id}`}>
                        <TableCell />
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{p.personName}</span>
                            <Badge variant={employmentTypeVariant(p.employmentType)}>
                              {employmentTypeLabel(p.employmentType)}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {p.serviceName}
                            </span>
                            {p.effPlanned && (
                              <Badge
                                variant="outline"
                                title="Noch keine Ist-Zeiten erfasst — Stunden und Betrag aus dem geplanten Zeitfenster"
                              >
                                geplant
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs text-muted-foreground">
                          {p.effMinutes > 0
                            ? `${formatMinutes(p.effMinutes)} h`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {p.agreedRate !== null
                            ? `${formatCurrency(p.agreedRate)} pausch.`
                            : p.hourlyRate !== null
                              ? `${formatCurrency(p.hourlyRate)}/h`
                              : p.personHourlyWage !== null &&
                                  p.employmentType === "MINIJOBBER"
                                ? `${formatCurrency(p.personHourlyWage)}/h`
                                : p.timeCost > 0
                                  ? "Lohn"
                                  : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-mono text-sm font-medium">
                          {p.effCost > 0 ? formatCurrency(p.effCost) : "—"}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    ))}
                    {orphanTime.minutes > 0 && (
                      <TableRow>
                        <TableCell />
                        <TableCell className="text-sm text-muted-foreground">
                          Weitere erfasste Zeiten (ohne Einsatz)
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs text-muted-foreground">
                          {formatMinutes(orphanTime.minutes)} h
                        </TableCell>
                        <TableCell />
                        <TableCell className="text-right tabular-nums font-mono text-sm font-medium">
                          {orphanTime.cost > 0 ? formatCurrency(orphanTime.cost) : "—"}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    )}
                  </TableBody>
                )}
              </Table>
            )}
          </div>

          <GroupTableFooter
            addLabel="Zumietungs-Gruppe"
            onAddGroup={() => setGroupDialog({ kind: "SUBHIRE", name: "" })}
            pending={pending}
            secondary={
              <FooterDashedButton
                pending={pending}
                onClick={() => setGroupDialog({ kind: "EXTRA", name: "" })}
              >
                Extrakosten-Gruppe
              </FooterDashedButton>
            }
          >
            <span>
              Zumietung{" "}
              <span className="font-mono tabular-nums">{formatCurrency(subhireTotal)}</span>
            </span>
            <span>
              Personal{" "}
              <span className="font-mono tabular-nums">{formatCurrency(extraPersonal)}</span>
            </span>
            <span>
              Sonstiges{" "}
              <span className="font-mono tabular-nums">{formatCurrency(extraOther)}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              Personal (Einsatzplan){" "}
              <span className="font-mono tabular-nums">{formatCurrency(personnelCost)}</span>
              <InfoHint text="Wird automatisch aus Einsätzen (Freelancer-Sätze) und erfassten Stunden (Minijobber) berechnet — Pflege im Tab Personal & Transport. Hier nicht doppelt als Extrakosten erfassen." />
            </span>
            <span>Kosten gesamt</span>
            <span className="font-mono text-sm font-extrabold text-primary">
              {formatCurrency(grandTotal)}
            </span>
          </GroupTableFooter>
        </div>
      </div>

      {/* -------------------- Dialoge -------------------- */}

      {/* Gruppe anlegen */}
      <Dialog open={groupDialog !== null} onOpenChange={(o) => !o && setGroupDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {groupDialog?.kind === "SUBHIRE"
                ? "Zumietungs-Gruppe anlegen"
                : "Extrakosten-Gruppe anlegen"}
            </DialogTitle>
            <DialogDescription>
              Gruppen sind nur für dieses Projekt — z.B. „Ton", „Licht", „Crew".
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateGroup();
            }}
            className="space-y-3"
          >
            <div className="space-y-2">
              <Label htmlFor="cost-group-name">Name</Label>
              <Input
                id="cost-group-name"
                value={groupDialog?.name ?? ""}
                onChange={(e) =>
                  setGroupDialog((g) => (g ? { ...g, name: e.target.value } : g))
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
                Anlegen
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
              Enthaltene Positionen werden in die nächste verbleibende Gruppe
              verschoben.
            </>
          )
        }
        confirmLabel="Löschen"
        pending={pending}
        onConfirm={handleDeleteGroup}
      />

      {/* Zumietung anlegen/bearbeiten */}
      <SubhireDialog
        projectId={projectId}
        value={subhireDialog}
        onClose={() => setSubhireDialog(null)}
        devices={devices}
        adHocItems={adHocItems}
        groups={materialGroups}
      />

      {/* Extrakosten anlegen/bearbeiten */}
      <Dialog open={extraDialog !== null} onOpenChange={(o) => !o && setExtraDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {extraDialog?.id ? "Extrakosten bearbeiten" : "Extrakosten hinzufügen"}
            </DialogTitle>
            <DialogDescription>
              Interne Zusatzkosten — erscheinen nicht auf Kundendokumenten.
            </DialogDescription>
          </DialogHeader>
          {extraDialog && (
            <div className="space-y-4">
              {extraGroups.length > 1 && (
                <div className="space-y-1.5">
                  <Label>Gruppe</Label>
                  <Select
                    value={extraDialog.groupId ?? ""}
                    onValueChange={(v) =>
                      setExtraDialog({ ...extraDialog, groupId: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Gruppe wählen…" />
                    </SelectTrigger>
                    <SelectContent>
                      {extraGroups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="extra-label">Bezeichnung</Label>
                <Input
                  id="extra-label"
                  value={extraDialog.label}
                  onChange={(e) =>
                    setExtraDialog({ ...extraDialog, label: e.target.value })
                  }
                  placeholder="z.B. Aushilfe Aufbau"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Kategorie</Label>
                  <Select
                    value={extraDialog.kind}
                    onValueChange={(v) =>
                      setExtraDialog({ ...extraDialog, kind: v as ExtraCostKind })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERSONAL">Personal</SelectItem>
                      <SelectItem value="SONSTIGES">Sonstiges</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="extra-amount">Betrag (netto)</Label>
                  <Input
                    id="extra-amount"
                    type="number"
                    min={0}
                    step="0.01"
                    value={extraDialog.amount}
                    onChange={(e) =>
                      setExtraDialog({
                        ...extraDialog,
                        amount: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="tabular-nums"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="extra-notes">Notiz (optional)</Label>
                <Textarea
                  id="extra-notes"
                  value={extraDialog.notes}
                  onChange={(e) =>
                    setExtraDialog({ ...extraDialog, notes: e.target.value })
                  }
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtraDialog(null)} disabled={pending}>
              Abbrechen
            </Button>
            <Button onClick={handleSaveExtra} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {extraDialog?.id ? "Speichern" : "Hinzufügen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={subhireDelete !== null}
        onOpenChange={(o) => !o && setSubhireDelete(null)}
        title="Zumietung entfernen?"
        description={`„${subhireDelete?.name}" wird dauerhaft entfernt.`}
        confirmLabel="Entfernen"
        pending={pending}
        onConfirm={handleDeleteSubhire}
      />
      <ConfirmDialog
        open={extraDelete !== null}
        onOpenChange={(o) => !o && setExtraDelete(null)}
        title="Extrakosten entfernen?"
        description={`„${extraDelete?.label}" wird dauerhaft entfernt.`}
        confirmLabel="Entfernen"
        pending={pending}
        onConfirm={handleDeleteExtra}
      />
    </Card>
  );
}
