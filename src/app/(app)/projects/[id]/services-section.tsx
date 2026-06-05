"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
} from "lucide-react";

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
  renameProjectGroup,
  deleteProjectGroup,
} from "./groups-actions";
import {
  billingUnitLabel,
  billingUnitShort,
  serviceItemKindLabel,
} from "@/lib/labels";
import { cn, formatCurrency } from "@/lib/utils";
import { BillingUnit, ServiceItemKind } from "@prisma/client";
import type { ProjectGroup } from "@prisma/client";
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
}: {
  projectId: string;
  projectServices: ProjectServiceVM[];
  catalog: ServiceItemVM[];
  groups: ProjectGroup[];
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
  } | null>(null);
  const [deleteGroupPrompt, setDeleteGroupPrompt] = useState<ProjectGroup | null>(null);

  const usedIds = useMemo(
    () => new Set(projectServices.map((p) => p.serviceItemId)),
    [projectServices]
  );

  const [extraItems, setExtraItems] = useState<ServiceItemVM[]>([]);

  const fullCatalog = useMemo(() => {
    const map = new Map<string, ServiceItemVM>();
    [...catalog, ...extraItems].forEach((c) => map.set(c.id, c));
    return Array.from(map.values());
  }, [catalog, extraItems]);

  const availableFromFullCatalog = useMemo(() => {
    return fullCatalog.filter((c) => {
      if (!c.active) return false;
      if (usedIds.has(c.id)) return false;
      if (kindFilter !== "all" && c.kind !== kindFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [fullCatalog, usedIds, kindFilter, search]);

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
          const res = await createProjectGroup(projectId, { name, kind: "SERVICE" });
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

  return (
    <>
      <HorizontalSplit
        storageKey="devo:services-split"
        defaultLeftPx={360}
        minLeftPx={280}
        minRightPx={520}
        className="lg:min-h-[calc(100vh-380px)] lg:items-stretch"
        left={
          <Card className="border-0 shadow-none lg:h-full flex flex-col">
            <CardHeader className="px-0 pt-0 pb-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold">
                  Verfügbare Personal- &amp; Transportfunktionen
                </h2>
                <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4" /> Neue Position
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Suchen..."
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
                {availableFromFullCatalog.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                    {search || kindFilter !== "all"
                      ? "Keine passenden Positionen"
                      : "Alle aktiven Positionen bereits gebucht — über „Neue Position“ kannst du eine anlegen."}
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
                                        className="group flex items-center gap-2 pl-8 pr-3 py-2 hover:bg-accent/40"
                                      >
                                        <div className="flex-1 min-w-0">
                                          <div className="truncate text-sm font-medium">
                                            {s.name}
                                          </div>
                                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                                            {formatCurrency(s.unitPrice)} /{" "}
                                            {billingUnitShort(s.unit)}
                                          </div>
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 shrink-0 opacity-60 group-hover:opacity-100"
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
              <h2 className="text-base font-semibold">
                Zugewiesen ({projectServices.length})
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
                  <FolderPlus className="h-8 w-8 opacity-30" />
                  <p className="text-sm">
                    Lege eine Gruppe an (z.B. „Aufbau", „Eventtag", „Abbau"), um
                    Personal- und Transport-Positionen zuzuordnen.
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
                      {groupItems.length === 0 ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">
                          Noch nichts in dieser Gruppe. Wähle eine Position aus dem
                          Katalog (Pfeil-Button) — sie wird der aktiven Gruppe
                          hinzugefügt.
                        </p>
                      ) : (
                        <Table className="[&_td]:py-2 [&_td]:px-2 [&_th]:h-9 [&_th]:px-2">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Position</TableHead>
                              <TableHead className="w-[90px] text-right">Menge</TableHead>
                              <TableHead className="w-[120px] text-right">€ / Einheit</TableHead>
                              <TableHead className="w-[100px] text-right">Summe</TableHead>
                              <TableHead className="w-[80px]"></TableHead>
                            </TableRow>
                          </TableHeader>
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
              {groupDialog?.mode === "create" ? "Neue Gruppe" : "Gruppe umbenennen"}
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
    </>
  );
}
