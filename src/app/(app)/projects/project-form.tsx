"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Check, Loader2, Plus, X } from "lucide-react";
import { createProject, updateProject } from "./actions";
import { toast } from "sonner";
import {
  ProjectKind,
  ProjectStatus,
  type BillingPeriod,
  type Customer,
  type Project,
} from "@prisma/client";
import { projectKindLabel, projectStatusLabel } from "@/lib/labels";
import { useRouter } from "next/navigation";
import { CustomerDialog } from "@/app/(app)/customers/customer-dialog";
import { addCustomerNameLine } from "@/app/(app)/customers/actions";
import { useAutoSave } from "@/lib/use-auto-save";
import { AutoSaveIndicator } from "@/components/ui/auto-save-indicator";
import { toastError } from "@/lib/toast";
import { DateRangeField } from "@/components/ui/date-range-field";
import { PeriodWeekCalendar } from "@/components/project/period-week-calendar";
import { adaptPeriodsToPlanning, suggestBillingDay } from "@/lib/period-planning";

type BillingPeriodInput = { start: Date; end: Date; notes: string };

export function ProjectForm({
  project,
  customers,
  users,
  currentUserId,
  billingPeriods,
  onCancel,
}: {
  project?: Project & { maintainerId?: string | null };
  customers: Customer[];
  users: { id: string; name: string | null; email: string }[];
  // Beim Anlegen eines neuen Projekts wird der aktuelle Benutzer
  // automatisch als Verantwortlich vorbelegt.
  currentUserId?: string | null;
  billingPeriods?: BillingPeriod[];
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: project?.name ?? "",
    customerId: project?.customerId ?? "",
    customerNameLine: project?.customerNameLine ?? "",
    description: project?.description ?? "",
    status: project?.status ?? ProjectStatus.DRAFT,
    kind: project?.kind ?? ProjectKind.DRYHIRE,
    discountPercent: project?.discountPercent?.toString() ?? "0",
    notes: project?.notes ?? "",
    maintainerId: project?.maintainerId ?? (project ? "" : currentUserId ?? ""),
  });

  const [plan, setPlan] = useState<{ start: Date; end: Date } | null>(() =>
    project ? { start: new Date(project.planningStart), end: new Date(project.planningEnd) } : null
  );
  const [planMissing, setPlanMissing] = useState(false);
  const [periods, setPeriods] = useState<BillingPeriodInput[]>(() =>
    (billingPeriods ?? []).map((p) => ({
      start: new Date(p.start),
      end: new Date(p.end),
      notes: p.notes ?? "",
    }))
  );

  // Erster Planungszeitraum → Berechnungstag wird vorgeschlagen (Mitte);
  // spätere Änderungen ziehen die Berechnungszeiträume nach.
  function changePlan(next: { start: Date; end: Date }) {
    setPeriods((prev) =>
      prev.length > 0 && plan
        ? adaptPeriodsToPlanning(prev, plan, next)
        : [{ notes: "", ...suggestBillingDay(next.start, next.end) }]
    );
    setPlan(next);
    setPlanMissing(false);
  }
  const [pending, startTransition] = useTransition();
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [extraCustomers, setExtraCustomers] = useState<
    Array<{ id: string; name: string; address: string | null; nameLines: string[] }>
  >([]);
  // Neue Zeile, die gerade über „+ Neue Zeile…" eingegeben wird (null = aus).
  const [newNameLine, setNewNameLine] = useState<string | null>(null);
  const [addingNameLine, startAddingNameLine] = useTransition();

  const allCustomers = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; address: string | null; nameLines: string[] }
    >();
    for (const c of customers) {
      map.set(c.id, {
        id: c.id,
        name: c.name,
        address: c.address,
        nameLines: c.nameLines,
      });
    }
    for (const c of extraCustomers) map.set(c.id, c);
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "de")
    );
  }, [customers, extraCustomers]);

  const selectedCustomer = useMemo(
    () => allCustomers.find((c) => c.id === form.customerId) ?? null,
    [allCustomers, form.customerId]
  );

  // Auswahl der zweiten Namenszeile: Liste des Kunden plus die aktuell im
  // Projekt gespeicherte Zeile, falls sie beim Kunden inzwischen fehlt.
  const nameLineOptions = useMemo(() => {
    const lines = selectedCustomer?.nameLines ?? [];
    return form.customerNameLine && !lines.includes(form.customerNameLine)
      ? [form.customerNameLine, ...lines]
      : lines;
  }, [selectedCustomer, form.customerNameLine]);

  function handleCustomerCreated(customer: {
    id: string;
    name: string;
    address: string | null;
  }) {
    setExtraCustomers((prev) => [...prev, { ...customer, nameLines: [] }]);
    setForm((f) => ({ ...f, customerId: customer.id, customerNameLine: "" }));
    setNewNameLine(null);
  }

  function saveNewNameLine() {
    const customer = selectedCustomer;
    const line = newNameLine?.trim();
    if (!customer || !line) return;
    startAddingNameLine(async () => {
      try {
        const nameLines = await addCustomerNameLine(customer.id, line);
        setExtraCustomers((prev) => [
          ...prev.filter((c) => c.id !== customer.id),
          { ...customer, nameLines },
        ]);
        setForm((f) => ({ ...f, customerNameLine: line }));
        setNewNameLine(null);
      } catch (e) {
        toastError(e, "Speichern");
      }
    });
  }

  const isEditMode = !!project;
  const isSale = form.kind === ProjectKind.VERKAUF;
  const autoSavePayload = useMemo(
    () => ({
      name: form.name,
      customerId: form.customerId || null,
      customerNameLine: form.customerNameLine || null,
      description: form.description || null,
      status: form.status,
      kind: form.kind,
      discountPercent: Number(form.discountPercent) || 0,
      notes: form.notes || null,
      maintainerId: form.maintainerId || null,
    }),
    [form.name, form.customerId, form.customerNameLine, form.description, form.status, form.kind, form.discountPercent, form.notes, form.maintainerId]
  );
  const { status: autoSaveStatus, error: autoSaveError } = useAutoSave(
    autoSavePayload,
    async (payload) => {
      if (!project) return;
      if (!payload.name.trim()) return;
      await updateProject(project.id, payload);
    },
    { delay: 800, enabled: isEditMode }
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isSale && !plan) {
      setPlanMissing(true);
      return;
    }
    startTransition(async () => {
      try {
        // Verkaufsprojekte haben keine Zeiträume — der Server setzt den
        // Planungszeitraum auf das Erstellungsdatum.
        const payload = {
          ...form,
          customerId: form.customerId || null,
          customerNameLine: form.customerNameLine || null,
          maintainerId: form.maintainerId || null,
          discountPercent: Number(form.discountPercent),
          planningStart: isSale ? undefined : plan?.start,
          planningEnd: isSale ? undefined : plan?.end,
          billingPeriods: isSale
            ? []
            : periods.map((p) => ({
                start: p.start,
                end: p.end,
                notes: p.notes || null,
              })),
        };
        if (project) {
          await updateProject(project.id, payload);
          toast.success("Projekt aktualisiert");
          router.refresh();
        } else {
          await createProject(payload);
        }
      } catch (e) {
        if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
        toastError(e, "Speichern");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <section className="space-y-4">
        <SectionHeader title="Allgemein" />

        <div className="space-y-2">
          <Label htmlFor="name">Projektname</Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v as ProjectStatus })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(ProjectStatus).map((s) => (
                  <SelectItem key={s} value={s}>
                    {projectStatusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="kind">Kategorie</Label>
            <Select
              value={form.kind}
              onValueChange={(v) => setForm({ ...form, kind: v as ProjectKind })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(ProjectKind).map((k) => (
                  <SelectItem key={k} value={k}>
                    {projectKindLabel(k)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="customer">Kunde</Label>
          <div className="flex gap-2">
            <div className="flex-1">
              <Combobox
                id="customer"
                value={form.customerId}
                onValueChange={(v) => {
                  // Die Namenszeilen gehören zum Kunden — bei Wechsel zurücksetzen.
                  if (v !== form.customerId) {
                    setForm({ ...form, customerId: v, customerNameLine: "" });
                    setNewNameLine(null);
                  }
                }}
                options={allCustomers.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="Kunde suchen…"
                emptyLabel="— Kein Kunde —"
                clearable
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setCustomerDialogOpen(true)}
              title="Neuen Kunden anlegen"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {selectedCustomer && (
            <p
              className={
                selectedCustomer.address
                  ? "text-xs text-muted-foreground whitespace-pre-line pl-1"
                  : "text-xs text-muted-foreground italic pl-1"
              }
            >
              {selectedCustomer.address || "Keine Anschrift hinterlegt"}
            </p>
          )}
        </div>

        {selectedCustomer && (
          <div className="space-y-2">
            <Label htmlFor="customerNameLine">Zweite Namenszeile</Label>
            {newNameLine === null ? (
              <Select
                value={form.customerNameLine || "none"}
                onValueChange={(v) => {
                  if (v === "__new__") {
                    setNewNameLine("");
                    return;
                  }
                  setForm({ ...form, customerNameLine: v === "none" ? "" : v });
                }}
              >
                <SelectTrigger id="customerNameLine">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Keine —</SelectItem>
                  {nameLineOptions.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                  <SelectItem value="__new__">+ Neue Zeile…</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="flex gap-2">
                <Input
                  id="customerNameLine"
                  value={newNameLine}
                  onChange={(e) => setNewNameLine(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter darf das Projekt-Formular nicht absenden.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveNewNameLine();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setNewNameLine(null);
                    }
                  }}
                  placeholder="z.B. Kulturamt"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={saveNewNameLine}
                  disabled={addingNameLine || !newNameLine.trim()}
                  title="Zeile beim Kunden speichern und auswählen"
                >
                  {addingNameLine ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setNewNameLine(null)}
                  title="Abbrechen"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground pl-1">
              Steht auf Angebot, Rechnung und Lieferschein unter dem Kundennamen.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="maintainer">Verantwortlich</Label>
          <Select
            value={form.maintainerId || "none"}
            onValueChange={(v) =>
              setForm({ ...form, maintainerId: v === "none" ? "" : v })
            }
          >
            <SelectTrigger id="maintainer">
              <SelectValue placeholder="Verantwortlich wählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Niemand —</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {!project && !isSale && (
      <section className="space-y-4">
        <SectionHeader
          title="Zeiträume"
          subtitle="Planungszeitraum blockt Material für andere Projekte · Berechnungszeiträume bestimmen die Mietpreise"
        />

        <div className="space-y-2">
          <Label htmlFor="planning">Planungszeitraum</Label>
          <DateRangeField
            id="planning"
            start={plan?.start ?? null}
            end={plan?.end ?? null}
            onChange={(start, end) => changePlan({ start, end })}
          />
          {planMissing && (
            <p className="text-xs text-destructive">Planungszeitraum erforderlich</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Berechnungszeiträume</Label>
          {plan ? (
            <PeriodWeekCalendar
              plan={plan}
              periods={periods}
              onPlanChange={changePlan}
              onPeriodsChange={setPeriods}
              makePeriod={(start, end) => ({ start, end, notes: "" })}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              Erst den Planungszeitraum wählen — der mittlere Tag wird als Berechnungstag
              vorgeschlagen.
            </p>
          )}
        </div>
      </section>
      )}

      <CustomerDialog
        open={customerDialogOpen}
        onOpenChange={setCustomerDialogOpen}
        onCreated={handleCustomerCreated}
      />

      {/* Im Dialog (Anlegen-Modus) klebt die Leiste am unteren Rand des
          scrollenden DialogBody, damit „Anlegen" immer erreichbar bleibt. */}
      <div
        className={
          isEditMode
            ? "flex items-center justify-end gap-2 border-t pt-4"
            : "sticky bottom-0 -mx-1 flex items-center justify-end gap-2 border-t bg-background px-1 pt-4"
        }
      >
        {isEditMode ? (
          <AutoSaveIndicator status={autoSaveStatus} error={autoSaveError} />
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => (onCancel ? onCancel() : router.back())}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Anlegen
            </Button>
          </>
        )}
      </div>
    </form>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b pb-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {subtitle && (
        <p className="mt-0.5 text-xs text-muted-foreground/80">{subtitle}</p>
      )}
    </div>
  );
}
