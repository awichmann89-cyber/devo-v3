"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FilterResetButton,
  FilterSearch,
} from "@/components/filters/filter-controls";
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
import { InfoHint } from "@/components/ui/info-hint";
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
  Trash2,
  FolderPlus,
  Pencil,
  Loader2,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Clock,
  Folder,
  FolderOpen,
  Receipt,
  Users,
  UserPlus,
  UserRound,
  Truck,
  Caravan,
  Package,
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

/** Badge-Variante je ServiceItemKind (Redesign: getönte Status-Badges). */
function kindBadgeVariant(kind: ServiceItemKind): "secondary" | "warning" | "outline" {
  if (kind === "PERSONAL") return "secondary";
  if (kind === "TRANSPORT") return "warning";
  return "outline";
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
  removePersonAssignment,
  setAssignmentInvoiceReceived,
  updateAssignmentRate,
} from "./person-assignments-actions";
import { removeVehicleAssignment } from "./vehicle-assignments-actions";
import {
  VehicleAssignmentDialog,
  type VehicleAssignmentVM,
} from "./vehicle-assignment-dialog";
import type { VehicleOptionVM } from "../../vehicles/vehicle-dialog";
import {
  PersonAssignmentDialog,
  periodLabel,
  type BusyIntervalVM,
  type PeriodOptionVM,
  type PersonAssignmentVM,
  type PersonOptionVM,
} from "./person-assignment-dialog";
import { formatMinutes } from "@/lib/personnel-costs";
import { maxSeverity, type ConflictHit } from "@/lib/booking-conflicts";
import {
  conflictSeverityHint,
  conflictSeverityLabel,
  conflictSeverityVariant,
  employmentTypeLabel,
  employmentTypeVariant,
  vehicleKindLabel,
  vehicleKindVariant,
} from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/utils";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  billingUnitShort,
  serviceItemKindLabel,
} from "@/lib/labels";
import { cn, formatCurrency } from "@/lib/utils";
import { BillingUnit, ServiceItemKind } from "@prisma/client";
import type { ProjectGroup, ProjectGroupComment } from "@prisma/client";
import { HorizontalSplit } from "@/components/ui/horizontal-split";
import { useTransitionSaveStatus } from "@/lib/use-auto-save";
import { AutoSaveIndicator } from "@/components/ui/auto-save-indicator";
import { toastError } from "@/lib/toast";

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
  // Einsatzplan: konkrete Personen an dieser Position
  personAssignments: PersonAssignmentVM[];
  // Disposition: konkrete Fahrzeuge/Anhänger (nur Transport-Positionen)
  vehicleAssignments: VehicleAssignmentVM[];
}

/** Konflikt-Badge für Einsätze — Stufe aus der schwersten Überschneidung. */
function ConflictBadge({
  conflicts,
  resource,
}: {
  conflicts: ConflictHit[];
  resource: string;
}) {
  const severity = maxSeverity(conflicts);
  if (!severity) return null;
  return (
    <Badge
      variant={conflictSeverityVariant(severity)}
      className="gap-1"
      title={`${conflictSeverityHint(severity, resource)}: ${conflicts
        .map((c) => c.projectName)
        .join(", ")}`}
    >
      <AlertTriangle className="h-3 w-3" />
      {conflictSeverityLabel(severity)}
    </Badge>
  );
}

/**
 * Kompakte Anzeige des Blockzeitfensters einer Fuhrpark-Einheit — gleiche
 * Fallback-Kette wie beim Personal, aber mit Fuhrpark-Wortwahl.
 */
function vehicleTimeLabel(a: VehicleAssignmentVM): string {
  if (!a.plannedStart || !a.plannedEnd) {
    if (a.periodStart && a.periodEnd) {
      return periodLabel({
        start: a.periodStart,
        end: a.periodEnd,
        notes: a.periodNotes,
      });
    }
    return "geblockt (gesamter Planungszeitraum)";
  }
  const s = new Date(a.plannedStart);
  const e = new Date(a.plannedEnd);
  const time = (d: Date) =>
    d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (s.toDateString() === e.toDateString()) {
    return `${formatDate(s)}, ${time(s)}–${time(e)} Uhr`;
  }
  return `${formatDateTime(s)} – ${formatDateTime(e)}`;
}

/**
 * Kompakte Anzeige des Einsatz-Zeitfensters — Fallback-Kette:
 * Uhrzeiten → gewählter Berechnungszeitraum → ganztägig (Planungszeitraum).
 */
function assignmentTimeLabel(a: PersonAssignmentVM): string {
  if (!a.plannedStart || !a.plannedEnd) {
    if (a.periodStart && a.periodEnd) {
      return periodLabel({
        start: a.periodStart,
        end: a.periodEnd,
        notes: a.periodNotes,
      });
    }
    return "ganztägig (Planungszeitraum)";
  }
  const s = new Date(a.plannedStart);
  const e = new Date(a.plannedEnd);
  const time = (d: Date) =>
    d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (s.toDateString() === e.toDateString()) {
    return `${formatDate(s)}, ${time(s)}–${time(e)} Uhr`;
  }
  return `${formatDateTime(s)} – ${formatDateTime(e)}`;
}

export function ServicesSection({
  projectId,
  projectServices,
  catalog,
  groups,
  groupComments,
  persons,
  vehicles,
  billingPeriods,
  groupPeriodIds,
  personBusy,
  vehicleBusy,
  planningStartIso,
  planningEndIso,
}: {
  projectId: string;
  projectServices: ProjectServiceVM[];
  catalog: ServiceItemVM[];
  groups: ProjectGroup[];
  groupComments: ProjectGroupComment[];
  persons: PersonOptionVM[];
  /** Aktive Fuhrpark-Einheiten für die Transport-Disposition. */
  vehicles: VehicleOptionVM[];
  billingPeriods: PeriodOptionVM[];
  /** Zeitraum-Auswahl je Gruppe (leer = alle Zeiträume). */
  groupPeriodIds: Record<string, string[]>;
  /** Fremd-Einsätze pro Person (andere Projekte) für die Überbuchungs-Warnung. */
  personBusy: Record<string, BusyIntervalVM[]>;
  /** Fremd-Einsätze pro Fuhrpark-Einheit (andere Projekte). */
  vehicleBusy: Record<string, BusyIntervalVM[]>;
  planningStartIso: string;
  planningEndIso: string;
}) {
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [collapsedKinds, setCollapsedKinds] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const saveStatus = useTransitionSaveStatus(pending);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<ProjectServiceVM | null>(null);
  // Einsatz-Dialog: anlegen (assignment null) oder bearbeiten
  const [assignDialog, setAssignDialog] = useState<{
    projectServiceId: string;
    serviceName: string;
    groupId: string;
    assignment: PersonAssignmentVM | null;
  } | null>(null);
  // Fahrzeug-Dialog: anlegen (assignment null) oder bearbeiten
  const [vehicleDialog, setVehicleDialog] = useState<{
    projectServiceId: string;
    serviceName: string;
    groupId: string;
    assignment: VehicleAssignmentVM | null;
  } | null>(null);
  // Einsatzplan ein-/ausklappen
  const [planOpen, setPlanOpen] = useState(true);

  // Zeiträume für den Einsatz-Dialog: Auswahl der Gruppe, sonst alle.
  const dialogPeriods = useMemo(() => {
    if (!assignDialog) return billingPeriods;
    const ids = groupPeriodIds[assignDialog.groupId] ?? [];
    if (ids.length === 0) return billingPeriods;
    return billingPeriods.filter((p) => ids.includes(p.id));
  }, [assignDialog, billingPeriods, groupPeriodIds]);

  // Zeiträume für den Fahrzeug-Dialog: Auswahl der Gruppe, sonst alle.
  const vehicleDialogPeriods = useMemo(() => {
    if (!vehicleDialog) return billingPeriods;
    const ids = groupPeriodIds[vehicleDialog.groupId] ?? [];
    if (ids.length === 0) return billingPeriods;
    return billingPeriods.filter((p) => ids.includes(p.id));
  }, [vehicleDialog, billingPeriods, groupPeriodIds]);

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
    // Zugeordnete Berechnungszeiträume (leer = alle)
    billingPeriodIds: string[];
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
        toastError(err, "Verschieben");
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

  function handleMoveGroup(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= groups.length) return;
    const ids = groups.map((g) => g.id);
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
        toastError(e, "Anlegen");
        return;
      }
    }
    const gid = groupId;
    startTransition(async () => {
      try {
        // Transport-Positionen mit Vorbelegung planen ihre Einheit gleich mit —
        // das melden wir zurück, damit die Blockierung nicht unbemerkt passiert.
        const res = await addProjectService(projectId, {
          serviceItemId,
          groupId: gid,
          quantity: 1,
        });
        if (res?.vehicleName) {
          toast.success(`Position hinzugefügt — ${res.vehicleName} eingeplant`);
        }
      } catch (e) {
        toastError(e, "Anlegen");
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
        toastError(e, "Speichern");
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
        toastError(e, "Speichern");
      }
    });
  }

  function handleMoveToGroup(serviceId: string, groupId: string) {
    startTransition(async () => {
      try {
        await moveProjectServiceToGroup(serviceId, groupId);
      } catch (e) {
        toastError(e, "Verschieben");
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
        toastError(e, "Löschen");
      }
    });
  }

  // ----- Einsatzplan (Personen an Positionen) -----
  function handleAssignmentRate(
    a: PersonAssignmentVM,
    value: string,
    kind: "agreed" | "hourly"
  ) {
    const trimmed = value.trim();
    const newVal = trimmed === "" ? null : Number(trimmed);
    if (newVal !== null && (!isFinite(newVal) || newVal < 0)) return;
    startTransition(async () => {
      try {
        await updateAssignmentRate(a.id, newVal, kind);
      } catch (e) {
        toastError(e, "Speichern");
      }
    });
  }

  function handleInvoiceToggle(a: PersonAssignmentVM) {
    startTransition(async () => {
      try {
        await setAssignmentInvoiceReceived(a.id, !a.invoiceReceived);
      } catch (e) {
        toastError(e, "Speichern");
      }
    });
  }

  function handleRemoveAssignment(a: PersonAssignmentVM) {
    startTransition(async () => {
      try {
        await removePersonAssignment(a.id);
        toast.success(
          a.loggedMinutes > 0
            ? "Einsatz entfernt — erfasste Zeiten bleiben erhalten"
            : "Einsatz entfernt"
        );
      } catch (e) {
        toastError(e, "Löschen");
      }
    });
  }

  function handleRemoveVehicleAssignment(a: VehicleAssignmentVM) {
    startTransition(async () => {
      try {
        await removeVehicleAssignment(a.id);
        toast.success("Einsatz entfernt");
      } catch (e) {
        toastError(e, "Löschen");
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
            billingPeriodIds: groupDialog.billingPeriodIds,
          });
          setActiveGroupId(res.id);
          toast.success("Gruppe angelegt");
        } else if (groupDialog.id) {
          await updateProjectGroup(groupDialog.id, {
            name,
            billable: groupDialog.billable,
            billingPeriodIds: groupDialog.billingPeriodIds,
          });
          toast.success("Gruppe gespeichert");
        }
        setGroupDialog(null);
      } catch (e) {
        toastError(e, "Speichern");
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
        toastError(e, "Löschen");
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

  // Einsatzplan: alle Personal- UND Fuhrpark-Einsätze chronologisch (nach
  // effektivem Beginn). Eine Liste, damit die Disposition Personal und
  // Fahrzeuge eines Tages zusammen sieht.
  type PlanEntry = {
    key: string;
    person: PersonAssignmentVM | null;
    vehicle: VehicleAssignmentVM | null;
    serviceName: string;
    groupName: string;
    sortKey: number;
  };
  const planEntries = useMemo<PlanEntry[]>(() => {
    const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
    const out: PlanEntry[] = [];
    for (const ps of projectServices) {
      const groupName = groupNameById.get(ps.groupId) ?? "";
      for (const a of ps.personAssignments) {
        const start = a.plannedStart ?? a.periodStart ?? planningStartIso;
        out.push({
          key: `person:${a.id}`,
          person: a,
          vehicle: null,
          serviceName: ps.serviceItem.name,
          groupName,
          sortKey: +new Date(start),
        });
      }
      for (const a of ps.vehicleAssignments) {
        const start = a.plannedStart ?? a.periodStart ?? planningStartIso;
        out.push({
          key: `vehicle:${a.id}`,
          person: null,
          vehicle: a,
          serviceName: ps.serviceItem.name,
          groupName,
          sortKey: +new Date(start),
        });
      }
    }
    return out.sort((x, y) => x.sortKey - y.sortKey);
  }, [projectServices, groups, planningStartIso]);

  /** Konflikt-Zähler je Stufe — speist die Badges im Kopf des Einsatzplans. */
  const planConflicts = useMemo(() => {
    let overlap = 0;
    let sameDay = 0;
    for (const e of planEntries) {
      const severity = maxSeverity(e.person?.conflicts ?? e.vehicle?.conflicts ?? []);
      if (severity === "OVERLAP") overlap++;
      else if (severity === "SAME_DAY") sameDay++;
    }
    return { overlap, sameDay };
  }, [planEntries]);

  const subtotal = projectServices.reduce(
    (sum, p) =>
      sum + p.quantity * (p.unitPriceOverride ?? p.serviceItem.unitPrice),
    0
  );

  /** Rendert eine Einsatz-Subzeile unter ihrer Service-Zeile (nicht sortierbar). */
  function renderAssignmentRow(ps: ProjectServiceVM, a: PersonAssignmentVM) {
    const isFreelancer = a.employmentType === "FREELANCER";
    return (
      <TableRow
        key={`assignment:${a.id}`}
        className="bg-muted/20 hover:bg-muted/30"
      >
        <TableCell />
        <TableCell>
          <div className="flex items-center gap-2 pl-6 text-sm">
            <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{a.personName}</span>
            <Badge variant={employmentTypeVariant(a.employmentType)}>
              {employmentTypeLabel(a.employmentType)}
            </Badge>
          </div>
          {a.notes && (
            <div className="pl-11 text-xs text-muted-foreground line-clamp-1">
              {a.notes}
            </div>
          )}
        </TableCell>
        <TableCell colSpan={2}>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{assignmentTimeLabel(a)}</span>
            {a.loggedMinutes > 0 && (
              <Badge variant="outline" className="gap-1 font-mono">
                <Clock className="h-3 w-3" />
                {formatMinutes(a.loggedMinutes)} h erfasst
              </Badge>
            )}
            <ConflictBadge conflicts={a.conflicts} resource="Die Person" />
          </div>
        </TableCell>
        <TableCell className="text-right">
          {isFreelancer ? (
            <div className="flex items-center justify-end gap-1">
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="Satz"
                defaultValue={
                  a.hourlyRate !== null
                    ? String(a.hourlyRate)
                    : a.agreedRate !== null
                      ? String(a.agreedRate)
                      : ""
                }
                onBlur={(e) => {
                  const raw = e.target.value;
                  const kind = a.hourlyRate !== null ? "hourly" : "agreed";
                  const current = a.hourlyRate ?? a.agreedRate;
                  const newVal = raw.trim() === "" ? null : Number(raw);
                  if (newVal !== current) handleAssignmentRate(a, raw, kind);
                }}
                className="h-7 w-24 text-right font-mono"
                title={
                  a.hourlyRate !== null
                    ? "Stundensatz (€/h) — Kosten = erfasste Stunden × Satz"
                    : "Pauschale/Tagessatz (€, gesamt) — zählt direkt als Projektkosten"
                }
              />
              <span className="w-7 text-left text-[10px] text-muted-foreground">
                {a.hourlyRate !== null ? "€/h" : "€"}
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell
          className="text-right num text-xs text-muted-foreground"
          title={
            isFreelancer && a.hourlyRate !== null && a.loggedMinutes === 0
              ? "Geplante Stunden × Satz — bis Ist-Zeiten erfasst sind"
              : undefined
          }
        >
          {isFreelancer && a.agreedRate !== null
            ? formatCurrency(a.agreedRate)
            : isFreelancer && a.hourlyRate !== null
              ? formatCurrency(
                  ((a.loggedMinutes > 0 ? a.loggedMinutes : a.plannedMinutes) / 60) *
                    a.hourlyRate
                )
              : ""}
        </TableCell>
        <TableCell>
          <div className="flex gap-0.5">
            {isFreelancer && (
              <Button
                variant="ghost"
                size="iconXs"
                className={
                  (a.invoiceReceived
                    ? "text-success hover:text-success"
                    : "text-muted-foreground")
                }
                onClick={() => handleInvoiceToggle(a)}
                disabled={pending}
                title={
                  a.invoiceReceived
                    ? "Rechnung erhalten — Klick zum Zurücksetzen"
                    : "Rechnung noch nicht erhalten — Klick zum Markieren"
                }
              >
                <Receipt className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="iconXs"
              
              onClick={() =>
                setAssignDialog({
                  projectServiceId: ps.id,
                  serviceName: ps.serviceItem.name,
                  groupId: ps.groupId,
                  assignment: a,
                })
              }
              disabled={pending}
              title="Einsatz bearbeiten"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="iconXs"
              className="text-destructive hover:text-destructive"
              onClick={() => handleRemoveAssignment(a)}
              disabled={pending}
              title="Einsatz entfernen (erfasste Zeiten bleiben erhalten)"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  /** Rendert eine Fuhrpark-Subzeile unter ihrer Transport-Zeile. */
  function renderVehicleAssignmentRow(
    ps: ProjectServiceVM,
    a: VehicleAssignmentVM
  ) {
    return (
      <TableRow key={`vehicle:${a.id}`} className="bg-muted/20 hover:bg-muted/30">
        <TableCell />
        <TableCell>
          <div className="flex items-center gap-2 pl-6 text-sm">
            <Caravan className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{a.vehicleName}</span>
            <Badge variant={vehicleKindVariant(a.vehicleKind)}>
              {vehicleKindLabel(a.vehicleKind)}
            </Badge>
            {a.licensePlate && (
              <span className="num text-xs text-muted-foreground">
                {a.licensePlate}
              </span>
            )}
          </div>
          {a.notes && (
            <div className="pl-11 text-xs text-muted-foreground line-clamp-1">
              {a.notes}
            </div>
          )}
        </TableCell>
        <TableCell colSpan={2}>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{vehicleTimeLabel(a)}</span>
            {a.driverName && (
              <Badge variant="outline" className="gap-1">
                <UserRound className="h-3 w-3" />
                {a.driverName}
              </Badge>
            )}
            <ConflictBadge conflicts={a.conflicts} resource="Die Einheit" />
          </div>
        </TableCell>
        <TableCell className="text-right">
          <span
            className="text-xs text-muted-foreground"
            title="Fahrzeuge werden pauschal über die Position berechnet — der Einsatz selbst erzeugt keine Kosten."
          >
            pauschal
          </span>
        </TableCell>
        <TableCell />
        <TableCell>
          <div className="flex gap-0.5">
            <Button
              variant="ghost"
              size="iconXs"
              onClick={() =>
                setVehicleDialog({
                  projectServiceId: ps.id,
                  serviceName: ps.serviceItem.name,
                  groupId: ps.groupId,
                  assignment: a,
                })
              }
              disabled={pending}
              title="Einsatz bearbeiten"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="iconXs"
              className="text-destructive hover:text-destructive"
              onClick={() => handleRemoveVehicleAssignment(a)}
              disabled={pending}
              title="Einsatz entfernen"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  /** Personal-Position ohne zugewiesene Person → farblich hervorheben. */
  function isUnstaffed(ps: ProjectServiceVM): boolean {
    return ps.serviceItem.kind === "PERSONAL" && ps.personAssignments.length === 0;
  }

  /** Transport-Position ohne eingeplante Fuhrpark-Einheit. */
  function isUnassignedTransport(ps: ProjectServiceVM): boolean {
    return (
      ps.serviceItem.kind === "TRANSPORT" && ps.vehicleAssignments.length === 0
    );
  }

  /** Rendert eine sortierbare Service-Zeile (Personal/Transport). */
  function renderServiceRow(ps: ProjectServiceVM, sortId: string) {
    const otherGroups = groups.filter((g) => g.id !== ps.groupId);
    const effectivePrice = ps.unitPriceOverride ?? ps.serviceItem.unitPrice;
    const line = ps.quantity * effectivePrice;
    const hasOverride = ps.unitPriceOverride !== null;
    const KindIcon = kindIcon(ps.serviceItem.kind);
    const unstaffed = isUnstaffed(ps);
    const withoutVehicle = isUnassignedTransport(ps);
    // Fragment: Service-Zeile + Einsatz-Subzeilen. Die Subzeilen sind NICHT im
    // SortableContext registriert — sie folgen ihrer Parent-Zeile in
    // DOM-Reihenfolge, bewegen sich beim Drag aber erst nach dem Drop mit.
    return (
      <Fragment key={sortId}>
      <SortableRow
        id={sortId}
        className={cn(
          (unstaffed || withoutVehicle) &&
            "bg-warning-subtle hover:bg-warning-subtle"
        )}
      >
        <DragHandleCell />
        <TableCell>
          <div className="flex items-center gap-2 font-medium truncate">
            <KindIcon
              className="h-4 w-4 text-muted-foreground shrink-0"
              aria-label={serviceItemKindLabel(ps.serviceItem.kind)}
            />
            <span className="truncate">{ps.serviceItem.name}</span>
            {unstaffed && (
              <Badge
                variant="warning"
                className="shrink-0"
                title="Noch keine Person eingeplant — über den Personen-Button zuweisen"
              >
                Unbesetzt
              </Badge>
            )}
            {withoutVehicle && (
              <Badge
                variant="warning"
                className="shrink-0"
                title="Noch kein Fahrzeug/Anhänger eingeplant — über den Fuhrpark-Button zuweisen"
              >
                Ohne Fahrzeug
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell>
          <Badge variant={kindBadgeVariant(ps.serviceItem.kind)}>
            {serviceItemKindLabel(ps.serviceItem.kind)}
          </Badge>
        </TableCell>
        <TableCell className="text-center">
          <QtyStepper
            min={0}
            allowDecimal
            value={ps.quantity}
            onChange={(v) => handleQty(ps, String(v))}
            disabled={pending}
            suffix={billingUnitShort(ps.serviceItem.unit)}
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
            className={
              "h-7 w-24 ml-auto text-right font-mono " +
              (hasOverride ? "border-warning" : "")
            }
            title={
              hasOverride
                ? `Katalogpreis: ${formatCurrency(ps.serviceItem.unitPrice)}`
                : "Leer = Katalogpreis"
            }
          />
        </TableCell>
        <TableCell className="text-right num text-sm font-medium">
          {formatCurrency(line)}
        </TableCell>
        <TableCell>
          <div className="flex gap-0.5">
            {/* Transport bekommt kein Personal: wer fährt, wird als Fahrer am
                Fahrzeug-Einsatz eingetragen. */}
            {ps.serviceItem.kind !== "TRANSPORT" && (
              <Button
                variant="ghost"
                size="iconXs"
                onClick={() =>
                  setAssignDialog({
                    projectServiceId: ps.id,
                    serviceName: ps.serviceItem.name,
                    groupId: ps.groupId,
                    assignment: null,
                  })
                }
                disabled={pending}
                title="Person einplanen"
              >
                <UserPlus className="h-3.5 w-3.5" />
              </Button>
            )}
            {ps.serviceItem.kind === "TRANSPORT" && (
              <Button
                variant="ghost"
                size="iconXs"
                onClick={() =>
                  setVehicleDialog({
                    projectServiceId: ps.id,
                    serviceName: ps.serviceItem.name,
                    groupId: ps.groupId,
                    assignment: null,
                  })
                }
                disabled={pending}
                title="Fahrzeug/Anhänger einplanen"
              >
                <Caravan className="h-3.5 w-3.5" />
              </Button>
            )}
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
              size="iconXs"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmRemove(ps)}
              disabled={pending}
              title="Entfernen"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TableCell>
      </SortableRow>
      {ps.personAssignments.map((a) => renderAssignmentRow(ps, a))}
      {ps.vehicleAssignments.map((a) => renderVehicleAssignmentRow(ps, a))}
      </Fragment>
    );
  }

  return (
    <>
      {/* Einsatzplan: chronologische Übersicht aller Personal- und
          Fuhrpark-Einsätze des Projekts. */}
      {planEntries.length > 0 && (
        <Card className="mb-4">
          <CardHeader
            className="cursor-pointer py-3"
            onClick={() => setPlanOpen((o) => !o)}
          >
            <CardTitle className="flex items-center gap-2">
              {planOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <Users className="h-4 w-4" /> Einsatzplan
              <span className="font-normal text-muted-foreground">
                ({planEntries.length} Einsätze)
              </span>
              {planConflicts.overlap > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> {planConflicts.overlap}{" "}
                  {planConflicts.overlap === 1 ? "Überbuchung" : "Überbuchungen"}
                </Badge>
              )}
              {planConflicts.sameDay > 0 && (
                <Badge
                  variant="warning"
                  className="gap-1"
                  title="Am selben Tag in einem anderen Projekt eingeplant — ohne Zeitüberschneidung"
                >
                  <AlertTriangle className="h-3 w-3" /> {planConflicts.sameDay}× selber Tag
                </Badge>
              )}
              {projectServices.filter(isUnstaffed).length > 0 && (
                <Badge variant="warning" className="gap-1">
                  {projectServices.filter(isUnstaffed).length} unbesetzte{" "}
                  {projectServices.filter(isUnstaffed).length === 1
                    ? "Position"
                    : "Positionen"}
                </Badge>
              )}
              {projectServices.filter(isUnassignedTransport).length > 0 && (
                <Badge variant="warning" className="gap-1">
                  {projectServices.filter(isUnassignedTransport).length}× ohne Fahrzeug
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          {planOpen && (
            <CardContent className="p-0">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Zeit</TableHead>
                    <TableHead>Person / Einheit</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Gruppe</TableHead>
                    <TableHead>Hinweise</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {planEntries.map((entry) => {
                    const { person, vehicle, serviceName, groupName } = entry;
                    return (
                      <TableRow key={entry.key}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {person
                            ? assignmentTimeLabel(person)
                            : vehicleTimeLabel(vehicle!)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm">
                            {person ? (
                              <>
                                <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className="font-medium">{person.personName}</span>
                                <Badge
                                  variant={employmentTypeVariant(person.employmentType)}
                                >
                                  {employmentTypeLabel(person.employmentType)}
                                </Badge>
                              </>
                            ) : (
                              <>
                                <Caravan className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className="font-medium">
                                  {vehicle!.vehicleName}
                                </span>
                                <Badge variant={vehicleKindVariant(vehicle!.vehicleKind)}>
                                  {vehicleKindLabel(vehicle!.vehicleKind)}
                                </Badge>
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{serviceName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {groupName}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <ConflictBadge
                              conflicts={person?.conflicts ?? vehicle!.conflicts}
                              resource={person ? "Die Person" : "Die Einheit"}
                            />
                            {vehicle?.driverName && (
                              <Badge variant="outline" className="gap-1">
                                <UserRound className="h-3 w-3" />
                                {vehicle.driverName}
                              </Badge>
                            )}
                            {(person?.notes ?? vehicle?.notes) && (
                              <span>📝 {person?.notes ?? vehicle?.notes}</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>
      )}

      {/* Auf Desktop wird die Card auf Viewport-Höhe begrenzt (abzüglich des
          52px-Headers + Abstände) und clippt intern. So kann die Seite nicht
          so weit scrollen, dass die Katalog-Suche hinter dem App-Header
          verschwindet — stattdessen scrollen Katalog und "zugewiesen"-Tabelle
          jeweils in ihrer eigenen Spalte. */}
      <Card className="flex flex-col lg:max-h-[calc(100vh-80px)] lg:overflow-hidden">
      <CardContent className="flex min-h-0 flex-1 flex-col p-4">
      <HorizontalSplit
        storageKey="devo:services-split"
        mobileLeftLabel="Katalog"
        defaultLeftPx={360}
        minLeftPx={280}
        minRightPx={520}
        className="lg:min-h-0 lg:flex-1 lg:items-stretch"
        leftClassName="lg:flex lg:flex-col lg:min-h-0"
        rightClassName="lg:flex lg:flex-col lg:min-h-0"
        left={
          <div className="flex flex-col lg:flex-1 lg:min-h-0">
            <div className="space-y-3 pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-4 w-4" /> Personal &amp; Transport
                </CardTitle>
                <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4" /> Position anlegen
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <FilterSearch
                  grow
                  value={search}
                  onChange={setSearch}
                  placeholder="Bezeichnung oder Beschreibung…"
                />
                <Select value={kindFilter} onValueChange={setKindFilter}>
                  <SelectTrigger className="w-[140px]" aria-label="Art filtern">
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
                  <FilterResetButton
                    onClick={() => {
                      setSearch("");
                      setKindFilter("all");
                    }}
                  />
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
            </div>
            <div className="min-h-0 flex-1 rounded-lg border">
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
                                          {s.defaultVehicleId && (
                                            <div
                                              className="flex items-center gap-1 truncate text-[11px] text-muted-foreground"
                                              title="Wird beim Hinzufügen automatisch eingeplant"
                                            >
                                              <Caravan className="h-3 w-3 shrink-0" />
                                              {vehicles.find(
                                                (v) => v.id === s.defaultVehicleId
                                              )?.name ?? "Einheit inaktiv"}
                                            </div>
                                          )}
                                        </div>
                                        <span className="shrink-0 num text-[11px] text-muted-foreground">
                                          {billingUnitShort(s.unit)}
                                        </span>
                                        <Button
                                          variant="ghost"
                                          size="iconXs"
                                          className="shrink-0 opacity-60 group-hover:opacity-100"
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
            </div>
          </div>
        }
        right={
          <div className="flex flex-col lg:flex-1 lg:min-h-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-0.5">
              <div className="text-xs text-muted-foreground">
                <span className="font-bold text-foreground">
                  {projectServices.length} Positionen
                </span>{" "}
                zugewiesen
              </div>
              {/* Mengen, Sätze und Gruppennamen speichern sofort. */}
              <AutoSaveIndicator status={saveStatus} />
            </div>

            {/* EINE durchgehende Tabelle — Gruppen als Kopfzeilen (Redesign). */}
            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card lg:flex-1">
              <div className="min-h-0 flex-1 overflow-y-auto">
                {groups.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
                    <FolderPlus className="h-8 w-8 opacity-30" />
                    <p className="text-sm">
                      Lege eine Gruppe an (z.B. „Aufbau", „Eventtag", „Abbau"), um
                      Personal- und Transport-Positionen zuzuordnen.
                    </p>
                  </div>
                ) : (
                  <Table density="dense">
                    <TableHeader>
                      <TableRow className="hover:bg-secondary">
                        <TableHead className="w-8"></TableHead>
                        <TableHead>Position</TableHead>
                        <TableHead className="w-[92px]">Art</TableHead>
                        <TableHead className="w-[130px] text-center">Menge</TableHead>
                        <TableHead className="w-[110px] text-right">Satz</TableHead>
                        <TableHead className="w-[110px] text-right">Summe</TableHead>
                        <TableHead className="w-[100px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    {groups.map((group, gi) => {
                      const groupItems = servicesByGroup.get(group.id) ?? [];
                      const groupSubtotal = groupItems.reduce(
                        (sum, ps) =>
                          sum +
                          ps.quantity *
                            (ps.unitPriceOverride ?? ps.serviceItem.unitPrice),
                        0
                      );
                      const serviceRows = buildServiceGroupRows(group.id);
                      return (
                        <DndContext
                          key={group.id}
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(e) => handleDragEnd(serviceRows, e)}
                        >
                          <TableBody>
                            <GroupHeaderRow
                              group={group}
                              colSpan={7}
                              sumLabel={formatCurrency(groupSubtotal)}
                              active={activeGroupId === group.id}
                              isFirst={gi === 0}
                              isLast={gi === groups.length - 1}
                              pending={pending}
                              onActivate={() => setActiveGroupId(group.id)}
                              onRename={(name) => handleRenameGroup(group.id, name)}
                              onMoveUp={() => handleMoveGroup(gi, -1)}
                              onMoveDown={() => handleMoveGroup(gi, 1)}
                              onAddNote={() => handleAddNote(group.id)}
                              onEdit={() =>
                                setGroupDialog({
                                  mode: "rename",
                                  id: group.id,
                                  name: group.name,
                                  billable: group.billable,
                                  billingPeriodIds: groupPeriodIds[group.id] ?? [],
                                })
                              }
                              onDelete={() => setDeleteGroupPrompt(group)}
                            />
                            {serviceRows.length === 0 && (
                              <TableRow>
                                <TableCell
                                  colSpan={7}
                                  className="py-3 text-center text-xs text-muted-foreground"
                                >
                                  Noch nichts in dieser Gruppe — Position im Katalog anklicken
                                  (Pfeil-Button), sie landet in der aktiven Gruppe.
                                </TableCell>
                              </TableRow>
                            )}
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
                                    <SortableRow id={r.sortId} key={r.sortId}>
                                      <DragHandleCell />
                                      <NoteRowCells
                                        text={c.text}
                                        colSpan={5}
                                        pending={pending}
                                        onSave={(txt) => handleSaveNote(c.id, txt)}
                                        onDelete={() => handleDeleteNote(c.id)}
                                      />
                                    </SortableRow>
                                  );
                                }
                                const ps = groupItems.find((x) => x.id === r.id);
                                if (!ps) return null;
                                return renderServiceRow(ps, r.sortId);
                              })}
                            </SortableContext>
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
                <span>Netto Personal &amp; Transport</span>
                <span className="font-mono text-sm font-extrabold text-primary">
                  {formatCurrency(subtotal)}
                </span>
              </GroupTableFooter>
            </div>
          </div>
        }
      />
      </CardContent>
      </Card>

      {/* Gruppe löschen — der Bestätigungsdialog fehlte bisher, sodass der
          Löschen-Button in der Gruppen-Kopfzeile wirkungslos war. */}
      <ConfirmDialog
        open={deleteGroupPrompt !== null}
        onOpenChange={(o) => !o && setDeleteGroupPrompt(null)}
        title="Gruppe löschen?"
        description={
          deleteGroupPrompt && (
            <>
              Die Gruppe <strong>{deleteGroupPrompt.name}</strong> wird gelöscht.
              Enthaltene Positionen werden in die nächste verbleibende Gruppe
              verschoben.
            </>
          )
        }
        confirmLabel="Löschen"
        pending={pending}
        onConfirm={() => handleDeleteGroup()}
      />

      <ServiceItemDialog
        vehicles={vehicles}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(created) => {
          setExtraItems((prev) => [...prev, created]);
          handleAdd(created.id);
        }}
      />

      <PersonAssignmentDialog
        open={assignDialog !== null}
        onOpenChange={(o) => !o && setAssignDialog(null)}
        projectServiceId={assignDialog?.projectServiceId ?? null}
        serviceName={assignDialog?.serviceName ?? ""}
        assignment={assignDialog?.assignment ?? null}
        persons={persons}
        periods={dialogPeriods}
        personBusy={personBusy}
        planningStartIso={planningStartIso}
        planningEndIso={planningEndIso}
      />

      <VehicleAssignmentDialog
        open={vehicleDialog !== null}
        onOpenChange={(o) => !o && setVehicleDialog(null)}
        projectServiceId={vehicleDialog?.projectServiceId ?? null}
        serviceName={vehicleDialog?.serviceName ?? ""}
        assignment={vehicleDialog?.assignment ?? null}
        vehicles={vehicles}
        drivers={persons.map((p) => ({ id: p.id, name: p.name }))}
        periods={vehicleDialogPeriods}
        vehicleBusy={vehicleBusy}
        planningStartIso={planningStartIso}
        planningEndIso={planningEndIso}
      />

      <Dialog
        open={confirmRemove !== null}
        onOpenChange={(o) => !o && setConfirmRemove(null)}
      >
        <DialogContent size="sm">
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
                  {confirmRemove.personAssignments.length > 0 && (
                    <>
                      {" "}
                      <strong>
                        {confirmRemove.personAssignments.length} zugeordnete{" "}
                        {confirmRemove.personAssignments.length === 1
                          ? "Einsatz wird"
                          : "Einsätze werden"}{" "}
                        mit entfernt
                      </strong>{" "}
                      (inkl. vereinbarter Freelancer-Sätze). Bereits erfasste
                      Arbeitszeiten bleiben erhalten.
                    </>
                  )}
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
        <DialogContent size="sm">
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
                  <Label>Berechnungszeiträume</Label>
                  <InfoHint text="Planungsgrundlage für Personal-Einsätze dieser Gruppe — die Zeitraum-Auswahl wird im Einplanen-Dialog vorgeschlagen. Keine Auswahl = alle Zeiträume." />
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

    </>
  );
}
