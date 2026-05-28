"use client";

import { useState, useTransition } from "react";
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
import { Loader2 } from "lucide-react";
import { createProject, updateProject } from "./actions";
import { toast } from "sonner";
import { ProjectStatus, type Project } from "@prisma/client";
import { projectStatusLabel } from "@/lib/labels";
import { useRouter } from "next/navigation";

function toInput(d: Date | string | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

export function ProjectForm({ project }: { project?: Project }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: project?.name ?? "",
    customer: project?.customer ?? "",
    description: project?.description ?? "",
    status: project?.status ?? ProjectStatus.DRAFT,
    planningStart: toInput(project?.planningStart),
    planningEnd: toInput(project?.planningEnd),
    billingStart: toInput(project?.billingStart),
    billingEnd: toInput(project?.billingEnd),
    discountPercent: project?.discountPercent?.toString() ?? "0",
    notes: project?.notes ?? "",
  });
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const payload = {
          ...form,
          discountPercent: Number(form.discountPercent),
          planningStart: new Date(form.planningStart),
          planningEnd: new Date(form.planningEnd),
          billingStart: new Date(form.billingStart),
          billingEnd: new Date(form.billingEnd),
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
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
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
          <Input
            id="customer"
            value={form.customer ?? ""}
            onChange={(e) => setForm({ ...form, customer: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <Select
          value={form.status}
          onValueChange={(v) => setForm({ ...form, status: v as ProjectStatus })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.values(ProjectStatus).map((s) => (
              <SelectItem key={s} value={s}>{projectStatusLabel(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border p-4 space-y-3">
        <div className="text-sm font-medium">Planungszeitraum (blockiert Geräte für andere Projekte)</div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="planStart">Start</Label>
            <Input id="planStart" type="date" value={form.planningStart} onChange={(e) => setForm({ ...form, planningStart: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="planEnd">Ende</Label>
            <Input id="planEnd" type="date" value={form.planningEnd} onChange={(e) => setForm({ ...form, planningEnd: e.target.value })} required />
          </div>
        </div>
      </div>

      <div className="rounded-md border p-4 space-y-3">
        <div className="text-sm font-medium">Berechnungszeitraum (für Mietpreis-Kalkulation)</div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="billStart">Start</Label>
            <Input id="billStart" type="date" value={form.billingStart} onChange={(e) => setForm({ ...form, billingStart: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="billEnd">Ende</Label>
            <Input id="billEnd" type="date" value={form.billingEnd} onChange={(e) => setForm({ ...form, billingEnd: e.target.value })} required />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="disc">Rabatt %</Label>
          <Input id="disc" type="number" step="0.01" min="0" max="100" value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: e.target.value })} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="desc">Beschreibung</Label>
        <Textarea id="desc" value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notizen (intern)</Label>
        <Textarea id="notes" value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>Abbrechen</Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {project ? "Speichern" : "Anlegen"}
        </Button>
      </div>
    </form>
  );
}
