"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
  Pencil,
  Trash2,
  Loader2,
  Link2,
  Users,
  Receipt,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { EmploymentType, ExtraCostKind } from "@prisma/client";
import { cn, formatCurrency } from "@/lib/utils";
import { employmentTypeLabel, employmentTypeVariant } from "@/lib/labels";
import { formatMinutes } from "@/lib/personnel-costs";
import { Badge } from "@/components/ui/badge";
import {
  GroupHeaderRow,
  NoteRowCells,
  QtyStepper,
  GroupTableFooter,
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
import { toastError } from "@/lib/toast";
import { useTransitionSaveStatus } from "@/lib/use-auto-save";
import { AutoSaveIndicator } from "@/components/ui/auto-save-indicator";

/**
 * Positions-Typen einer Kosten-Gruppe. Es gibt nur EINEN Gruppentyp — die
 * Positionen darin unterscheiden sich über ihr Icon:
 * Zumietung (Material) · Sonstiges (Extrakosten) · Personal (Einsatzplan).
 */
const TYPE_SUBHIRE = {
  icon: HandCoins,
  className: "text-subhire",
  label: "Material (zugemietet)",
} as const;
const TYPE_EXTRA = {
  icon: Receipt,
  className: "text-muted-foreground",
  label: "Sonstiges (Extrakosten)",
} as const;
const TYPE_PERSONNEL = {
  icon: Users,
  className: "text-muted-foreground",
  label: "Personal (Einsatzplan)",
} as const;

const PERSONNEL_INFO =
  "Automatisch aus dem Einsatzplan (Tab Personal & Transport): " +
  "Freelancer-Pauschalen direkt, Stunden-Vergütungen über die erfassten Zeiten. " +
  "Eine Zeile je Person — alle Einsätze des Projekts zusammengefasst. " +
  "Hier nicht doppelt als Extrakosten erfassen.";

/** Bezeichnungs-Zelle: Typ-Icon links, Titel und Zusatzzeilen rechts. */
function ItemLabel({
  type,
  children,
}: {
  type: { icon: LucideIcon; className: string; label: string };
  children: ReactNode;
}) {
  const Icon = type.icon;
  return (
    <div className="flex items-start gap-2">
      <span
        className="mt-0.5 shrink-0"
        role="img"
        title={type.label}
        aria-label={type.label}
      >
        <Icon className={cn("h-4 w-4", type.className)} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
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

interface Props {
  projectId: string;
  subhires: SubhireVM[];
  extraCosts: ExtraCostVM[];
  devices: { id: string; name: string; manufacturer: string | null; model: string | null }[];
  adHocItems: { id: string; name: string }[];
  /** Material-Gruppen — nur für die Platzierung freier Zumietungen im SubhireDialog. */
  materialGroups: { id: string; name: string }[];
  /** Gruppen der Kosten-Seite — nehmen Zumietungen UND Extrakosten auf. */
  costGroups: CostGroupVM[];
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
  personId: string;
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

/** Vergütungs-Label eines Einsatzes: Pauschale > Stundensatz > Stundenlohn. */
function personnelRateLabel(p: PersonnelEntryVM): string {
  if (p.agreedRate !== null) return `${formatCurrency(p.agreedRate)} pausch.`;
  if (p.hourlyRate !== null) return `${formatCurrency(p.hourlyRate)}/h`;
  if (p.personHourlyWage !== null && p.employmentType === "MINIJOBBER") {
    return `${formatCurrency(p.personHourlyWage)}/h`;
  }
  if (p.timeCost > 0) return "Lohn";
  return "—";
}

/** Eine Person mit allen ihren Einsätzen im Projekt zusammengefasst. */
interface PersonnelSummary {
  personId: string;
  personName: string;
  employmentType: EmploymentType;
  /** Anzahl der Einsätze, die in diese Zeile eingehen. */
  assignmentCount: number;
  /** Positionen, in denen die Person eingesetzt ist (ohne Dubletten). */
  serviceNames: string[];
  minutes: number;
  cost: number;
  /** true, sobald ein Einsatz noch auf geplanten statt erfassten Zeiten beruht. */
  planned: boolean;
  /** Satz, wenn über alle Einsätze identisch — sonst null („gemischt"). */
  rateLabel: string | null;
}

/**
 * Fasst den Einsatzplan für die Kosten-Seite auf eine Zeile je Person zusammen:
 * Stunden und Kosten summiert, teuerste Person oben. Die einzelnen Einsätze
 * stehen im Tab Personal & Transport.
 */
function summarizePersonnel(entries: PersonnelEntryVM[]): PersonnelSummary[] {
  const byPerson = new Map<string, PersonnelSummary>();
  const ratesByPerson = new Map<string, Set<string>>();
  for (const p of entries) {
    let row = byPerson.get(p.personId);
    if (!row) {
      row = {
        personId: p.personId,
        personName: p.personName,
        employmentType: p.employmentType,
        assignmentCount: 0,
        serviceNames: [],
        minutes: 0,
        cost: 0,
        planned: false,
        rateLabel: null,
      };
      byPerson.set(p.personId, row);
      ratesByPerson.set(p.personId, new Set());
    }
    row.assignmentCount += 1;
    if (!row.serviceNames.includes(p.serviceName)) row.serviceNames.push(p.serviceName);
    row.minutes += p.effMinutes;
    row.cost += p.effCost;
    row.planned = row.planned || p.effPlanned;
    ratesByPerson.get(p.personId)!.add(personnelRateLabel(p));
  }
  for (const row of byPerson.values()) {
    const rates = ratesByPerson.get(row.personId)!;
    row.rateLabel = rates.size === 1 ? [...rates][0] : null;
  }
  return [...byPerson.values()].sort(
    (a, b) => b.cost - a.cost || a.personName.localeCompare(b.personName, "de")
  );
}

type ExtraDialogState = {
  id?: string;
  groupId: string | null;
  label: string;
  /** Kategorie bleibt am Datensatz (Finanzen-Tab), hat aber keine eigene UI mehr. */
  kind: ExtraCostKind;
  amount: number;
  notes: string;
} | null;

type DeleteGroupState = { id: string; name: string } | null;

/** Spaltenzahl der durchgehenden Tabelle. */
const COL_SPAN_ALL = 6;

export function CostsSection({
  projectId,
  subhires,
  extraCosts,
  devices,
  adHocItems,
  materialGroups,
  costGroups,
  groupComments,
  personnelCost,
  personnelEntries,
  orphanTime,
}: Props) {
  const [pending, startTransition] = useTransition();
  const saveStatus = useTransitionSaveStatus(pending);

  // ----- Dialog-/Lösch-State -----
  const [subhireDialog, setSubhireDialog] = useState<SubhireFormValue | null>(null);
  const [subhireDelete, setSubhireDelete] = useState<SubhireVM | null>(null);
  const [extraDialog, setExtraDialog] = useState<ExtraDialogState>(null);
  const [extraDelete, setExtraDelete] = useState<ExtraCostVM | null>(null);
  const [groupDialog, setGroupDialog] = useState<{ name: string } | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<DeleteGroupState>(null);

  // ----- Aktive Gruppe (Ziel neuer Positionen) -----
  const [activeGroupId, setActiveGroupId] = useState<string | null>(
    costGroups[0]?.id ?? null
  );
  useEffect(() => {
    if (!activeGroupId && costGroups[0]) {
      setActiveGroupId(costGroups[0].id);
    }
    if (activeGroupId && !costGroups.find((g) => g.id === activeGroupId)) {
      setActiveGroupId(costGroups[0]?.id ?? null);
    }
  }, [costGroups, activeGroupId]);

  // ----- Ableitungen -----
  const deviceNameById = new Map(devices.map((d) => [d.id, d.name]));
  const adHocNameById = new Map(adHocItems.map((a) => [a.id, a.name]));
  function linkedName(s: SubhireVM): string | null {
    if (s.deviceId) return deviceNameById.get(s.deviceId) ?? null;
    if (s.adHocItemId) return adHocNameById.get(s.adHocItemId) ?? null;
    return null;
  }

  const groupNameById = new Map(costGroups.map((g) => [g.id, g.name]));
  const costGroupIds = new Set(costGroups.map((g) => g.id));
  // Fallback: Positionen ohne (gültige) Gruppe — z.B. nach Löschen der letzten Gruppe.
  const ungroupedSubhires = subhires.filter(
    (s) => !s.costGroupId || !costGroupIds.has(s.costGroupId)
  );
  const ungroupedExtras = extraCosts.filter(
    (c) => !c.groupId || !costGroupIds.has(c.groupId)
  );

  const commentsByGroup = new Map<string, CostGroupCommentVM[]>();
  for (const c of groupComments) {
    if (!costGroupIds.has(c.groupId)) continue;
    const arr = commentsByGroup.get(c.groupId) ?? [];
    arr.push(c);
    commentsByGroup.set(c.groupId, arr);
  }

  const subhireTotal = subhires.reduce((s, x) => s + x.unitCost * x.quantity, 0);
  const extraTotal = extraCosts.reduce((s, c) => s + c.amount, 0);
  // Personalkosten aus dem Einsatzplan fließen mit in "Kosten gesamt" ein —
  // gepflegt werden sie im Tab Personal & Transport, hier nur Anzeige.
  const grandTotal = subhireTotal + extraTotal + personnelCost;

  // Einsatzplan auf eine Zeile je Person verdichten — sonst steht hier pro
  // Einsatz eine Zeile und die Liste wird unübersichtlich.
  const personnelRows = summarizePersonnel(personnelEntries);
  const hasPersonnel = personnelRows.length > 0 || orphanTime.minutes > 0;
  const isEmpty =
    costGroups.length === 0 &&
    subhires.length === 0 &&
    extraCosts.length === 0 &&
    !hasPersonnel;

  /** Summe einer Gruppe über beide Positions-Typen. */
  function groupSum(groupId: string): number {
    return (
      subhires
        .filter((s) => s.costGroupId === groupId)
        .reduce((acc, s) => acc + s.unitCost * s.quantity, 0) +
      extraCosts
        .filter((c) => c.groupId === groupId)
        .reduce((acc, c) => acc + c.amount, 0)
    );
  }

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

  /**
   * Alle Zeilen einer Kosten-Gruppe in Anzeige-Reihenfolge: Zumietungen,
   * Extrakosten und Zwischenüberschriften teilen sich einen sortOrder-Raum.
   */
  function buildGroupRows(groupId: string): GroupRow[] {
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
        toastError(err, "Verschieben");
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
        const res = await createProjectGroup(projectId, { name, kind: "COST" });
        setActiveGroupId(res.id);
        setGroupDialog(null);
      } catch (e) {
        toastError(e, "Anlegen");
      }
    });
  }

  function handleRenameGroup(id: string, name: string) {
    startTransition(async () => {
      try {
        await renameProjectGroup(id, name);
      } catch (e) {
        toastError(e, "Speichern");
      }
    });
  }

  function handleMoveGroup(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= costGroups.length) return;
    const ids = costGroups.map((g) => g.id);
    [ids[index], ids[j]] = [ids[j], ids[index]];
    startTransition(async () => {
      try {
        await reorderProjectGroups(ids);
      } catch (e) {
        toastError(e, "Verschieben");
      }
    });
  }

  function handleDeleteGroup() {
    if (!deleteGroup) return;
    const { id } = deleteGroup;
    // Enthaltene Positionen in die nächste verbleibende Gruppe verschieben —
    // Kostendaten dürfen beim Gruppenlöschen nicht verloren gehen.
    const moveTo = costGroups.find((g) => g.id !== id)?.id ?? null;
    startTransition(async () => {
      try {
        await deleteProjectGroup(id, moveTo);
        setDeleteGroup(null);
      } catch (e) {
        toastError(e, "Speichern");
      }
    });
  }

  // ----- Zwischenüberschriften -----
  function handleAddNote(groupId: string) {
    startTransition(async () => {
      try {
        await addGroupComment(projectId, groupId, "Zwischenüberschrift");
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

  // ----- Zumietungen -----
  function handleSubhireQty(id: string, q: number) {
    if (q < 1) return;
    startTransition(async () => {
      try {
        await updateSubhireQuantity(id, q);
      } catch (e) {
        toastError(e, "Speichern");
      }
    });
  }

  function handleMoveSubhire(id: string, groupId: string) {
    startTransition(async () => {
      try {
        await moveSubhireToCostGroup(id, groupId);
      } catch (e) {
        toastError(e, "Verschieben");
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
        toastError(e, "Löschen");
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
          toast.success("Position gespeichert");
        } else {
          await addExtraCost(projectId, payload);
          toast.success("Position hinzugefügt");
        }
        setExtraDialog(null);
      } catch (e) {
        toastError(e, "Speichern");
      }
    });
  }

  function handleMoveExtra(id: string, groupId: string) {
    startTransition(async () => {
      try {
        await moveExtraCostToGroup(id, groupId);
      } catch (e) {
        toastError(e, "Verschieben");
      }
    });
  }

  function handleDeleteExtra() {
    if (!extraDelete) return;
    const id = extraDelete.id;
    startTransition(async () => {
      try {
        await removeExtraCost(id);
        toast.success("Position entfernt");
        setExtraDelete(null);
      } catch (e) {
        toastError(e, "Löschen");
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
    currentGroupId: string | null;
    onMove: (groupId: string) => void;
    onEdit: () => void;
    onDelete: () => void;
  }) {
    return (
      <div className="flex items-center justify-end gap-1">
        {costGroups.length > 1 && opts.currentGroupId && (
          <Select value={opts.currentGroupId} onValueChange={opts.onMove}>
            <SelectTrigger className="h-7 w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {costGroups.map((og) => (
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
          title="Bearbeiten"
          aria-label="Bearbeiten"
          onClick={opts.onEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghostDestructive"
          size="iconXs"
          title="Entfernen"
          aria-label="Entfernen"
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
    const supplier = s.supplier?.trim();
    // Vermieter nur zeigen, wenn er nicht schon die Gruppen-Überschrift ist.
    const groupName = s.costGroupId ? groupNameById.get(s.costGroupId) : undefined;
    const showSupplier =
      !!supplier && supplier.toLowerCase() !== (groupName ?? "").trim().toLowerCase();
    const cells = (
      <>
        <TableCell>
          <ItemLabel type={TYPE_SUBHIRE}>
            <div className="truncate font-medium">{s.name}</div>
            {showSupplier && (
              <div className="truncate text-[11px] text-muted-foreground">
                {supplier}
              </div>
            )}
            {(s.deviceId || s.adHocItemId) && (
              <div className="flex items-center gap-1 text-[11px] text-subhire">
                <Link2 className="h-3 w-3" />
                verknüpft
                {linkedName(s) && linkedName(s) !== s.name && (
                  <span className="text-muted-foreground">({linkedName(s)})</span>
                )}
              </div>
            )}
            {s.notes?.trim() && (
              <div className="truncate text-[11px] text-muted-foreground">{s.notes}</div>
            )}
          </ItemLabel>
        </TableCell>
        <TableCell className="text-center">
          <QtyStepper
            value={s.quantity}
            onChange={(v) => handleSubhireQty(s.id, v)}
            disabled={pending}
          />
        </TableCell>
        <TableCell className="text-right num text-sm">
          {formatCurrency(s.unitCost)}
        </TableCell>
        <TableCell className="text-right num text-sm font-medium">
          {formatCurrency(s.unitCost * s.quantity)}
        </TableCell>
        <TableCell>
          {rowActions({
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
        <TableRow key={sortId}>
          <TableCell />
          {cells}
        </TableRow>
      );
    }
    return (
      <SortableRow id={sortId} key={sortId}>
        <DragHandleCell />
        {cells}
      </SortableRow>
    );
  }

  /** Sortierbare Extrakosten-Zeile. */
  function renderExtraRow(c: ExtraCostVM, sortId: string, sortable = true) {
    const cells = (
      <>
        <TableCell>
          <ItemLabel type={TYPE_EXTRA}>
            <div className="truncate font-medium">{c.label}</div>
            {c.notes && (
              <div className="truncate text-[11px] text-muted-foreground">{c.notes}</div>
            )}
          </ItemLabel>
        </TableCell>
        <TableCell className="text-center text-xs text-muted-foreground">—</TableCell>
        <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
        <TableCell className="text-right num text-sm font-medium">
          {formatCurrency(c.amount)}
        </TableCell>
        <TableCell>
          {rowActions({
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
        <TableRow key={sortId}>
          <TableCell />
          {cells}
        </TableRow>
      );
    }
    return (
      <SortableRow id={sortId} key={sortId}>
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

  /** Eine Kosten-Gruppe (Kopfzeile + sortierbare Zeilen) rendern. */
  function renderGroupSection(g: CostGroupVM, index: number) {
    const rows = buildGroupRows(g.id);
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
            sumLabel={formatCurrency(groupSum(g.id))}
            active={activeGroupId === g.id}
            isFirst={index === 0}
            isLast={index === costGroups.length - 1}
            pending={pending}
            onActivate={() => setActiveGroupId(g.id)}
            activeHint="Aktive Gruppe — neue Zumietungen und Extrakosten landen hier"
            onRename={(name) => handleRenameGroup(g.id, name)}
            onMoveUp={() => handleMoveGroup(index, -1)}
            onMoveDown={() => handleMoveGroup(index, 1)}
            onAddNote={() => handleAddNote(g.id)}
            onDelete={() => setDeleteGroup({ id: g.id, name: g.name })}
          />
          {rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={COL_SPAN_ALL}
                className="py-3 text-center text-xs text-muted-foreground"
              >
                Noch nichts in dieser Gruppe — neue Zumietungen und Extrakosten
                landen in der aktiven Gruppe.
              </TableCell>
            </TableRow>
          )}
          <SortableContext
            items={rows.map((r) => r.sortId)}
            strategy={verticalListSortingStrategy}
          >
            {rows.map((r) => {
              if (r.kind === "COMMENT") {
                const c = (commentsByGroup.get(g.id) ?? []).find((x) => x.id === r.id);
                return c ? renderCommentRow(c, r.sortId) : null;
              }
              if (r.kind === "EXTRA") {
                const c = extraCosts.find((x) => x.id === r.id);
                return c ? renderExtraRow(c, r.sortId) : null;
              }
              const s = subhires.find((x) => x.id === r.id);
              return s ? renderSubhireRow(s, r.sortId) : null;
            })}
          </SortableContext>
        </TableBody>
      </DndContext>
    );
  }

  return (
    // Auf Desktop wird die Card auf Viewport-Höhe begrenzt (abzüglich des
    // 52px-Headers + Abstände) und clippt intern, sodass die Kosten-Tabelle in
    // ihrer eigenen Fläche scrollt statt die ganze Seite wachsen zu lassen.
    <Card className="flex flex-col lg:max-h-[calc(100vh-80px)] lg:overflow-hidden">
      <CardContent className="flex min-h-0 flex-1 flex-col p-4">
        {/* Kopfzeile: Summen links, Aktionen rechts. */}
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-0.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              <span className="font-bold text-foreground">
                {subhires.length} Zumietung(en)
              </span>{" "}
              · {extraCosts.length} Sonstiges-Position(en)
            </span>
            <InfoHint text="Rein interne Kosten — erscheinen nicht auf Angeboten, Rechnungen oder Packlisten und ändern die Planung nicht." />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Mengen und Gruppennamen speichern sofort. */}
            <AutoSaveIndicator status={saveStatus} className="mr-1" />
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setExtraDialog({
                  groupId: activeGroupId,
                  label: "",
                  kind: "SONSTIGES",
                  amount: 0,
                  notes: "",
                })
              }
            >
              <Receipt className="h-4 w-4" /> Sonstiges
            </Button>
            <Button
              size="sm"
              onClick={() =>
                setSubhireDialog(emptySubhire({ costGroupId: activeGroupId }))
              }
            >
              <HandCoins className="h-4 w-4" /> Zumietung hinzufügen
            </Button>
          </div>
        </div>

        {/* EINE durchgehende Tabelle: alle Kosten-Gruppen, danach die
            abgeleitete Personal-Gruppe aus dem Einsatzplan. */}
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
              <Table density="dense" bordered={false} stickyHeader>
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

                {costGroups.map((g, gi) => renderGroupSection(g, gi))}

                {(ungroupedSubhires.length > 0 || ungroupedExtras.length > 0) && (
                  <TableBody>
                    {renderUngroupedHeader("__ungrouped__")}
                    {ungroupedSubhires.map((s) =>
                      renderSubhireRow(s, `SUBHIRE:${s.id}`, false)
                    )}
                    {ungroupedExtras.map((c) =>
                      renderExtraRow(c, `EXTRA:${c.id}`, false)
                    )}
                  </TableBody>
                )}

                {/* Personal (Einsatzplan): eigene Gruppe in derselben Optik,
                    aber abgeleitet — Pflege im Tab Personal & Transport. */}
                {hasPersonnel && (
                  <TableBody>
                    <GroupHeaderRow
                      group={{
                        id: "__personnel__",
                        name: "Personal (Einsatzplan)",
                        billable: true,
                      }}
                      colSpan={COL_SPAN_ALL}
                      sumLabel={formatCurrency(personnelCost)}
                      readOnly
                      icon={Users}
                      info={PERSONNEL_INFO}
                    />
                    {personnelRows.map((r) => {
                      const positions = r.serviceNames.join(" · ");
                      return (
                        <TableRow key={`personnel:${r.personId}`}>
                          <TableCell />
                          <TableCell>
                            <ItemLabel type={TYPE_PERSONNEL}>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{r.personName}</span>
                                <Badge variant={employmentTypeVariant(r.employmentType)}>
                                  {employmentTypeLabel(r.employmentType)}
                                </Badge>
                                <span
                                  className="truncate text-xs text-muted-foreground"
                                  title={positions}
                                >
                                  {r.assignmentCount}{" "}
                                  {r.assignmentCount === 1 ? "Einsatz" : "Einsätze"} ·{" "}
                                  {positions}
                                </span>
                                {r.planned && (
                                  <Badge
                                    variant="outline"
                                    title="Für mindestens einen Einsatz sind noch keine Ist-Zeiten erfasst — Stunden und Betrag stammen dort aus dem geplanten Zeitfenster"
                                  >
                                    geplant
                                  </Badge>
                                )}
                              </div>
                            </ItemLabel>
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs text-muted-foreground">
                            {r.minutes > 0 ? `${formatMinutes(r.minutes)} h` : "—"}
                          </TableCell>
                          <TableCell
                            className="text-right font-mono text-xs text-muted-foreground"
                            title={
                              r.rateLabel
                                ? undefined
                                : "Unterschiedliche Vergütungen in den Einsätzen dieser Person"
                            }
                          >
                            {r.rateLabel ?? "gemischt"}
                          </TableCell>
                          <TableCell className="text-right num text-sm font-medium">
                            {r.cost > 0 ? formatCurrency(r.cost) : "—"}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      );
                    })}
                    {orphanTime.minutes > 0 && (
                      <TableRow>
                        <TableCell />
                        <TableCell>
                          <ItemLabel type={TYPE_PERSONNEL}>
                            <span className="text-sm text-muted-foreground">
                              Weitere erfasste Zeiten (ohne Einsatz)
                            </span>
                          </ItemLabel>
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs text-muted-foreground">
                          {formatMinutes(orphanTime.minutes)} h
                        </TableCell>
                        <TableCell />
                        <TableCell className="text-right num text-sm font-medium">
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
            addLabel="Gruppe"
            onAddGroup={() => setGroupDialog({ name: "" })}
            pending={pending}
          >
            <span>
              Zumietung <span className="num">{formatCurrency(subhireTotal)}</span>
            </span>
            <span>
              Sonstiges <span className="num">{formatCurrency(extraTotal)}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              Personal <span className="num">{formatCurrency(personnelCost)}</span>
              <InfoHint text={PERSONNEL_INFO} />
            </span>
            <span>Kosten gesamt</span>
            <span className="font-mono text-sm font-extrabold text-primary">
              {formatCurrency(grandTotal)}
            </span>
          </GroupTableFooter>
        </div>
      </CardContent>

      {/* -------------------- Dialoge -------------------- */}

      {/* Gruppe anlegen */}
      <Dialog open={groupDialog !== null} onOpenChange={(o) => !o && setGroupDialog(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Gruppe anlegen</DialogTitle>
            <DialogDescription>
              Gruppen nehmen Zumietungen und Sonstiges gemeinsam auf und gelten nur
              für dieses Projekt — z.B. der Vermieter, bei dem du zumietest, oder
              „Crew", „Transport".
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
        costGroups={costGroups}
      />

      {/* Extrakosten anlegen/bearbeiten */}
      <Dialog open={extraDialog !== null} onOpenChange={(o) => !o && setExtraDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {extraDialog?.id ? "Sonstiges bearbeiten" : "Sonstiges hinzufügen"}
            </DialogTitle>
            <DialogDescription>
              Interne Zusatzkosten neben der Zumietung — erscheinen nicht auf
              Kundendokumenten.
            </DialogDescription>
          </DialogHeader>
          {extraDialog && (
            <div className="space-y-4">
              {costGroups.length > 1 && (
                <div className="space-y-1.5">
                  <Label>Gruppe</Label>
                  <Select
                    value={extraDialog.groupId ?? ""}
                    onValueChange={(v) => setExtraDialog({ ...extraDialog, groupId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Gruppe wählen…" />
                    </SelectTrigger>
                    <SelectContent>
                      {costGroups.map((g) => (
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
                  placeholder="z.B. Sprit Sprinter"
                  autoFocus
                />
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
                  className="num"
                />
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
        title="Position entfernen?"
        description={`„${extraDelete?.label}" wird dauerhaft entfernt.`}
        confirmLabel="Entfernen"
        pending={pending}
        onConfirm={handleDeleteExtra}
      />
    </Card>
  );
}
