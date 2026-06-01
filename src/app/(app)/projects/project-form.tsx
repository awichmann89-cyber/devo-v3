"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { createProject, updateProject } from "./actions";
import { toast } from "sonner";
import { ProjectStatus, type BillingPeriod, type Customer, type Project } from "@prisma/client";
import { projectStatusLabel } from "@/lib/labels";
import { useRouter } from "next/navigation";
import { CustomerDialog } from "@/app/(app)/customers/customer-dialog";

/** Date → "YYYY-MM-DDTHH:mm" für <input type="datetime-local">. */
function toLocalInput(d: Date | string | undefined | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

type BillingPeriodInput = { start: string; end: string; notes: string };

export function ProjectForm({
  project,
  customers,
  billingPeriods,
  onCancel,
}: {
  project?: Project;
  customers: Customer[];
  /** Vorhandene Berechnungszeiträume bei Edit, sonst undefined */
  billingPeriods?: BillingPeriod[];
  /** Wenn übergeben (z.B. im Dialog), wird das statt router.back() aufgerufen */
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: project?.name ?? "",
    customerId: project?.customerId ?? "",
    description: project?.description ?? "",
    status: project?.status ?? ProjectStatus.DRAFT,
    planningStart: toLocalInput(project?.planningStart),
    planningEnd: toLocalInput(project?.planningEnd),
    discountPercent: project?.discountPercent?.toString() ?? "0",
    notes: project?.notes ?? "",
  });

  // Berechnungszeiträume separat halten (dynamische Liste)
  const [periods, setPeriods] = useState<BillingPeriodInput[]>(() => {
    if (billingPeriods && billingPeriods.length > 0) {
      return billingPeriods.map((p) => ({
        start: toLocalInput(p.start),
        end: toLocalInput(p.end),
        notes: p.notes ?? "",
      }));
    }
    return [{ start: "", end: "", notes: "" }];
  });

  function addPeriod() {
    setPeriods((prev) => [...prev, { start: "", end: "", notes: "" }]);
  }
  function removePeriod(i: number) {
    setPeriods((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updatePeriod(i: number, field: keyof BillingPeriodInput, value: string) {
    setPeriods((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p))
    );
  }
  const [pending, startTransition] = useTransition();
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [extraCustomers, setExtraCustomers] = useState<
    Array<{ id: string; name: string; address: string | null }>
  >([]);

  // Server-Customers + frisch angelegte (noch nicht in den Props) zusammenführen.
  // Verhindert ein kurzes Aufblitzen "leerer Auswahl" beim Anlegen.
  const allCustomers = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; address: string | null }
    >();
    for (const c of customers) {
      map.set(c.id, { id: c.id, name: c.name, address: c.address });
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

  function handleCustomerCreated(customer: {
    id: string;
    name: string;
    address: string | null;
  }) {
    setExtraCustomers((prev) => [...prev, customer]);
    setForm((f) => ({ ...f, customerId: customer.id }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const payload = {
          ...form,
          customerId: form.customerId || null,
          discountPercent: Number(form.discountPercent),
          planningStart: new Date(form.planningStart),
          planningEnd: new Date(form.planningEnd),
          billingPeriods: periods.map((p) => ({
            start: new Date(p.start),
            end: new Date(p.end),
            notes: p.notes || null,
          })),
        };
        if (project) {
          await updateProject(project.id, payload);
          toast.success("Projekt aktualisiert");
          router.refresh();
        } else {
          await createProject(payload);
          // redirect erfolgt in der Action
        }
      } catch (e) {
        toast.error("Fehler", { description: e instanceof Error ? e.message : String(e) });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {/* ───────────────── Section 1: Allgemein ───────────────── */}
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

        <div className="space-y-2">
          <Label htmlFor="customer">Kunde</Label>
          <div className="flex gap-2">
            <Select
              value={form.customerId || "none"}
              onValueChange={(v) =>
                setForm({ ...form, customerId: v === "none" ? "" : v })
              }
            >
              <SelectTrigger id="customer" className="flex-1">
                <SelectValue placeholder="Kunde wählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Kein Kunde —</SelectItem>
                {allCustomers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
      </section>

      {/* ───────────────── Section 2: Zeiträume ───────────────── */}
      <section className="space-y-4">
        <SectionHeader
          title="Zeiträume"
          subtitle="Planungszeitraum blockt Material für andere Projekte · Berechnungszeiträume bestimmen die Mietpreise"
        />

        <div className="rounded-md border p-4 space-y-3">
          <div className="text-sm font-medium">Planungszeitraum</div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="planStart">Start</Label>
              <Input
                id="planStart"
                type="datetime-local"
                value={form.planningStart}
                onChange={(e) => setForm({ ...form, planningStart: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="planEnd">Ende</Label>
              <Input
                id="planEnd"
                type="datetime-local"
                value={form.planningEnd}
                onChange={(e) => setForm({ ...form, planningEnd: e.target.value })}
                required
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">
              Berechnungszeiträume {periods.length > 1 && `(${periods.length})`}
            </div>
          </div>
          {periods.map((p, i) => (
            <div key={i} className="rounded-md border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Zeitraum {i + 1}
                </div>
                {periods.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => removePeriod(i)}
                    title="Zeitraum entfernen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start</Label>
                  <Input
                    type="datetime-local"
                    value={p.start}
                    onChange={(e) => updatePeriod(i, "start", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ende</Label>
                  <Input
                    type="datetime-local"
                    value={p.end}
                    onChange={(e) => updatePeriod(i, "end", e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Bemerkung (optional)</Label>
                <Input
                  value={p.notes}
                  onChange={(e) => updatePeriod(i, "notes", e.target.value)}
                  placeholder="z.B. Wochenende 1 — Konzertabend"
                />
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addPeriod}>
            <Plus className="h-4 w-4" /> Weiteren Zeitraum hinzufügen
          </Button>
        </div>
      </section>

      {/* ───────────────── Section 3: Konditionen & Notizen ───────────────── */}
      <section className="space-y-4">
        <SectionHeader title="Konditionen & Notizen" />

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="disc">Rabatt %</Label>
            <Input
              id="disc"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={form.discountPercent}
              onChange={(e) => setForm({ ...form, discountPercent: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="desc">Beschreibung</Label>
          <Textarea
            id="desc"
            value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notizen (intern)</Label>
          <Textarea
            id="notes"
            value={form.notes ?? ""}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
          />
        </div>
      </section>

      <CustomerDialog
        open={customerDialogOpen}
        onOpenChange={setCustomerDialogOpen}
        onCreated={handleCustomerCreated}
      />

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => (onCancel ? onCancel() : router.back())}
        >
          Abbrechen
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {project ? "Speichern" : "Anlegen"}
        </Button>
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
