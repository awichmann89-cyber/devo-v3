"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RowAction, RowActions } from "@/components/ui/row-actions";
import { TimeSelect } from "@/components/ui/time-select";
import { CalendarRange, Calculator, CopyCheck, Scissors, Trash2 } from "lucide-react";
import { updateProjectPeriods } from "./periods-actions";
import { useAutoSave } from "@/lib/use-auto-save";
import { AutoSaveIndicator } from "@/components/ui/auto-save-indicator";
import { DateRangeField } from "@/components/ui/date-range-field";
import { PeriodWeekCalendar } from "@/components/project/period-week-calendar";
import {
  adaptPeriodsToPlanning,
  dayBounds,
  dayDiff,
  isOvernight,
  periodTimes,
  splitIntoDays,
  suggestBillingDay,
  withPeriodTimes,
  type PeriodTimes,
} from "@/lib/period-planning";
import { daysBetween } from "@/lib/utils";

const dayFmt = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// Vorbelegung des Endes, wenn ein ganztägiger Zeitraum eine Start-Uhrzeit
// bekommt: acht Stunden später (18:00 → 02:00).
function defaultEndTime(start: string): string {
  const [h, m] = start.split(":").map(Number);
  const mins = (h * 60 + m + 8 * 60) % (24 * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

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

  function setTimes(i: number, times: PeriodTimes) {
    setPeriods(periods.map((p, idx) => (idx === i ? withPeriodTimes(p, times) : p)));
  }

  function makePeriod(start: Date, end: Date): PeriodState {
    return { id: null, start, end, notes: "" };
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
            <InfoHint text="Bestimmen den Mietpreis. Mehrere Zeiträume möglich — z.B. zwei getrennte Wochenenden, ohne die Werktage dazwischen zu berechnen. Uhrzeiten übernimmt die Personalplanung als Einsatzzeiten." />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PeriodWeekCalendar
            plan={plan}
            periods={periods}
            onPlanChange={changePlan}
            onPeriodsChange={setPeriods}
            makePeriod={makePeriod}
            periodLabel={(p, i) => p.notes || `Zeitraum ${i + 1}`}
          />

          <ul className="divide-y rounded-md border">
            {periods.map((p, i) => {
              const b = dayBounds(p.start, p.end);
              const days = daysBetween(p.start, p.end);
              const times = periodTimes(p);
              return (
                <li
                  key={p.id ?? `new-${i}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="w-20 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Zeitraum {i + 1}
                    </div>
                    <div className="w-[19rem] shrink-0 whitespace-nowrap text-sm">
                      {dayDiff(b.first, b.last) === 0
                        ? dayFmt.format(b.first)
                        : `${dayFmt.format(b.first)} – ${dayFmt.format(b.last)}`}
                      <span className="ml-1.5 text-muted-foreground">
                        ({days} {days === 1 ? "Tag" : "Tage"})
                      </span>
                    </div>
                    <div className="flex w-[280px] shrink-0 items-center gap-1.5">
                      <TimeSelect
                        aria-label={`Start-Uhrzeit Zeitraum ${i + 1}`}
                        className="w-[124px]"
                        value={times?.start ?? null}
                        allDayLabel="Ganztägig"
                        onChange={(v) =>
                          setTimes(
                            i,
                            v ? { start: v, end: times?.end ?? defaultEndTime(v) } : null
                          )
                        }
                      />
                      {times && (
                        <>
                          <span className="text-muted-foreground">–</span>
                          <TimeSelect
                            aria-label={`End-Uhrzeit Zeitraum ${i + 1}`}
                            className="w-[112px]"
                            value={times.end}
                            onChange={(v) => v && setTimes(i, { start: times.start, end: v })}
                          />
                          {isOvernight(times) && (
                            <span
                              className="text-xs text-muted-foreground"
                              title="Endet am Folgetag"
                            >
                              +1
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex min-w-[18rem] flex-1 items-center gap-2">
                    <Input
                      aria-label={`Bemerkung Zeitraum ${i + 1}`}
                      className="flex-1"
                      value={p.notes}
                      onChange={(e) =>
                        setPeriods(
                          periods.map((x, idx) => (idx === i ? { ...x, notes: e.target.value } : x))
                        )
                      }
                      placeholder="Bemerkung, z.B. Konzertabend"
                    />
                    {/* Feste Breite, damit die Bemerkungsfelder bündig stehen. */}
                    <RowActions density="compact" className="w-[104px]">
                      {periods.length > 1 && (
                        <RowAction
                          icon={CopyCheck}
                          label="Uhrzeiten für alle Zeiträume übernehmen"
                          onClick={() =>
                            setPeriods(periods.map((x) => withPeriodTimes(x, times)))
                          }
                        />
                      )}
                      {dayDiff(b.first, b.last) > 0 && (
                        <RowAction
                          icon={Scissors}
                          label="In Einzeltage aufteilen"
                          onClick={() => setPeriods(splitIntoDays(periods, i, makePeriod))}
                        />
                      )}
                      <RowAction
                        icon={Trash2}
                        label="Zeitraum entfernen"
                        destructive
                        disabled={periods.length <= 1}
                        onClick={() => removePeriod(i)}
                      />
                    </RowActions>
                  </div>
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
