"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CalendarRange, Calculator, Trash2 } from "lucide-react";
import { updateProjectPeriods } from "./periods-actions";
import { useAutoSave } from "@/lib/use-auto-save";
import { AutoSaveIndicator } from "@/components/ui/auto-save-indicator";
import { DateRangeField } from "@/components/ui/date-range-field";
import { PeriodWeekCalendar } from "@/components/project/period-week-calendar";
import {
  adaptPeriodsToPlanning,
  dayBounds,
  dayDiff,
  suggestBillingDay,
} from "@/lib/period-planning";
import { daysBetween } from "@/lib/utils";

const dayFmt = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

interface PeriodState {
  // id bestehender Zeiträume — bleibt beim Speichern erhalten, damit
  // Personal-Einsätze und Gruppen ihre Zeitraum-Verknüpfung behalten.
  id: string | null;
  start: Date;
  end: Date;
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
  const [plan, setPlan] = useState(() => ({
    start: new Date(planningStart),
    end: new Date(planningEnd),
  }));
  const [periods, setPeriods] = useState<PeriodState[]>(() =>
    billingPeriods.map((p) => ({
      id: p.id,
      start: new Date(p.start),
      end: new Date(p.end),
      notes: p.notes ?? "",
    }))
  );

  function changePlan(next: { start: Date; end: Date }) {
    setPeriods((prev) =>
      prev.length > 0
        ? adaptPeriodsToPlanning(prev, plan, next)
        : [{ id: null, notes: "", ...suggestBillingDay(next.start, next.end) }]
    );
    setPlan(next);
  }

  function removePeriod(i: number) {
    if (periods.length <= 1) return;
    setPeriods(periods.filter((_, idx) => idx !== i));
  }

  const totalDays = periods.reduce((sum, p) => sum + daysBetween(p.start, p.end), 0);

  const { status: autoSaveStatus, error: autoSaveError } = useAutoSave(
    { plan, periods },
    async ({ plan, periods }) => {
      if (periods.length === 0) return;
      await updateProjectPeriods(projectId, {
        planningStart: plan.start,
        planningEnd: plan.end,
        billingPeriods: periods.map((p) => ({
          id: p.id,
          start: p.start,
          end: p.end,
          notes: p.notes || null,
        })),
      });
    },
    { delay: 800 }
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4" /> Planungszeitraum
            <InfoHint text="Blockt das gebuchte Material für andere Projekte. Bestimmt nicht den Mietpreis." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DateRangeField
            id="planning"
            start={plan.start}
            end={plan.end}
            onChange={(start, end) => changePlan({ start, end })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4" /> Berechnungszeiträume
            <Badge variant="outline" className="text-xs">
              {totalDays} {totalDays === 1 ? "Tag" : "Tage"}
              {periods.length > 1 && ` · ${periods.length} Zeiträume`}
            </Badge>
            <InfoHint text="Bestimmen den Mietpreis. Mehrere Zeiträume möglich — z.B. zwei getrennte Wochenenden, ohne die Werktage dazwischen zu berechnen." />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PeriodWeekCalendar
            plan={plan}
            periods={periods}
            onPlanChange={changePlan}
            onPeriodsChange={setPeriods}
            makePeriod={(start, end) => ({ id: null, start, end, notes: "" })}
            periodLabel={(p, i) => p.notes || `Zeitraum ${i + 1}`}
          />

          <ul className="divide-y rounded-md border">
            {periods.map((p, i) => {
              const b = dayBounds(p.start, p.end);
              const days = daysBetween(p.start, p.end);
              return (
                <li key={p.id ?? `new-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 sm:flex-nowrap">
                  <div className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Zeitraum {i + 1}
                  </div>
                  <div className="shrink-0 text-sm sm:w-64">
                    {dayDiff(b.first, b.last) === 0
                      ? dayFmt.format(b.first)
                      : `${dayFmt.format(b.first)} – ${dayFmt.format(b.last)}`}
                    <span className="ml-1.5 text-muted-foreground">
                      ({days} {days === 1 ? "Tag" : "Tage"})
                    </span>
                  </div>
                  <Input
                    aria-label={`Bemerkung Zeitraum ${i + 1}`}
                    value={p.notes}
                    onChange={(e) =>
                      setPeriods(
                        periods.map((x, idx) => (idx === i ? { ...x, notes: e.target.value } : x))
                      )
                    }
                    placeholder="Bemerkung, z.B. Konzertabend"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="iconXs"
                    onClick={() => removePeriod(i)}
                    disabled={periods.length <= 1}
                    title="Zeitraum entfernen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <AutoSaveIndicator status={autoSaveStatus} error={autoSaveError} />
      </div>
    </div>
  );
}
