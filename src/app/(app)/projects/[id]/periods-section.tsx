"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CalendarRange, Calculator, Plus, Trash2 } from "lucide-react";
import { updateProjectPeriods } from "./periods-actions";
import { useAutoSave } from "@/lib/use-auto-save";
import { AutoSaveIndicator } from "@/components/ui/auto-save-indicator";

function toLocalInput(d?: Date | string | null): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

interface PeriodInput {
  // id bestehender Zeiträume — bleibt beim Speichern erhalten, damit
  // Personal-Einsätze und Gruppen ihre Zeitraum-Verknüpfung behalten.
  id: string | null;
  start: string;
  end: string;
  notes: string;
}

interface Props {
  projectId: string;
  planningStart: Date | string;
  planningEnd: Date | string;
  billingPeriods: {
    id: string;
    start: Date | string;
    end: Date | string;
    notes: string | null;
  }[];
}

export function PeriodsSection({
  projectId,
  planningStart,
  planningEnd,
  billingPeriods,
}: Props) {
  const [planStart, setPlanStart] = useState(toLocalInput(planningStart));
  const [planEnd, setPlanEnd] = useState(toLocalInput(planningEnd));
  const [periods, setPeriods] = useState<PeriodInput[]>(() =>
    billingPeriods.length > 0
      ? billingPeriods.map((p) => ({
          id: p.id,
          start: toLocalInput(p.start),
          end: toLocalInput(p.end),
          notes: p.notes ?? "",
        }))
      : [{ id: null, start: "", end: "", notes: "" }]
  );

  function addPeriod() {
    setPeriods([...periods, { id: null, start: "", end: "", notes: "" }]);
  }
  function removePeriod(i: number) {
    if (periods.length <= 1) return;
    setPeriods(periods.filter((_, idx) => idx !== i));
  }
  function updatePeriod(i: number, key: keyof PeriodInput, value: string) {
    setPeriods(periods.map((p, idx) => (idx === i ? { ...p, [key]: value } : p)));
  }

  // Auto-Save mit Validierung — skippt, wenn unvollständig
  const { status: autoSaveStatus, error: autoSaveError } = useAutoSave(
    { planStart, planEnd, periods },
    async ({ planStart, planEnd, periods }) => {
      if (!planStart || !planEnd) return;
      if (periods.some((p) => !p.start || !p.end)) return;
      await updateProjectPeriods(projectId, {
        planningStart: new Date(planStart),
        planningEnd: new Date(planEnd),
        billingPeriods: periods.map((p) => ({
          id: p.id,
          start: new Date(p.start),
          end: new Date(p.end),
          notes: p.notes || null,
        })),
      });
    },
    { delay: 800 }
  );

  return (
    <div className="space-y-4">
      {/* Planung */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4" /> Planungszeitraum
            <InfoHint text="Blockt das gebuchte Material für andere Projekte. Bestimmt nicht den Mietpreis." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="planStart">Start</Label>
              <Input
                id="planStart"
                type="datetime-local"
                value={planStart}
                onChange={(e) => setPlanStart(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="planEnd">Ende</Label>
              <Input
                id="planEnd"
                type="datetime-local"
                value={planEnd}
                onChange={(e) => setPlanEnd(e.target.value)}
                required
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Berechnungszeiträume */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4" /> Berechnungszeiträume
            <Badge variant="outline" className="text-xs">
              {periods.length}{" "}
              {periods.length === 1 ? "Zeitraum" : "Zeiträume"}
            </Badge>
            <InfoHint text="Bestimmen den Mietpreis. Mehrere Zeiträume möglich — z.B. zwei getrennte Wochenenden, ohne die Werktage dazwischen zu berechnen." />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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
                    size="iconXs"
                    
                    onClick={() => removePeriod(i)}
                    title="Zeitraum entfernen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
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
                <Label className="text-xs text-muted-foreground">
                  Bemerkung (optional)
                </Label>
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
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <AutoSaveIndicator status={autoSaveStatus} error={autoSaveError} />
      </div>
    </div>
  );
}
