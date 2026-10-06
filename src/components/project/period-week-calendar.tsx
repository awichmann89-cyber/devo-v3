"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  addDays,
  dayBounds,
  dayDiff,
  dayKey,
  eachDay,
  fromDayKey,
  shiftPeriod,
  startOfDay,
  toggleBillingDay,
} from "@/lib/period-planning";

type Period = { start: Date; end: Date };
type Plan = { start: Date; end: Date };

type DragAction = "plan-start" | "plan-end" | "period-move" | "period-start" | "period-end" | "day";

interface DragState {
  action: DragAction;
  index: number;
  origin: Date;
  moved: boolean;
}

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const monthFmt = new Intl.DateTimeFormat("de-DE", { month: "short" });
const dayFmt = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long" });

function mondayOf(d: Date): Date {
  return addDays(startOfDay(d), -((d.getDay() + 6) % 7));
}

/**
 * Wochenkalender über den Planungszeitraum (plus je eine Woche davor und
 * danach). Berechnungszeiträume sind Balken:
 *  - Klick auf einen Tag im Planungszeitraum schaltet ihn als Berechnungstag
 *    an/aus.
 *  - Balken ziehen verschiebt den Zeitraum, an den Enden ziehen ändert die
 *    Länge.
 *  - Die Griffe am Planungszeitraum verlängern oder verkürzen ihn.
 * Uhrzeiten bleiben beim Verschieben erhalten.
 */
export function PeriodWeekCalendar<T extends Period>({
  plan,
  periods,
  onPlanChange,
  onPeriodsChange,
  makePeriod,
  periodLabel = (_, i) => `Zeitraum ${i + 1}`,
}: {
  plan: Plan;
  periods: T[];
  onPlanChange: (plan: Plan) => void;
  onPeriodsChange: (periods: T[]) => void;
  makePeriod: (start: Date, end: Date) => T;
  periodLabel?: (p: T, index: number) => string;
}) {
  const drag = useRef<DragState | null>(null);
  const [previewPlan, setPreviewPlan] = useState<Plan | null>(null);
  const [previewPeriods, setPreviewPeriods] = useState<T[] | null>(null);

  const shownPlan = previewPlan ?? plan;
  const shownPeriods = previewPeriods ?? periods;

  // Raster aus den gespeicherten Werten, damit es beim Ziehen nicht springt.
  const weeks = useMemo(() => {
    const first = addDays(mondayOf(plan.start), -7);
    const last = addDays(mondayOf(plan.end), 13);
    const days = eachDay(first, last);
    const out: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [plan.start, plan.end]);

  const planFirst = startOfDay(shownPlan.start);
  const planLast = startOfDay(shownPlan.end);
  const inPlan = (d: Date) => dayDiff(planFirst, d) >= 0 && dayDiff(d, planLast) >= 0;

  // Tag → Index des Berechnungszeitraums
  const dayToPeriod = useMemo(() => {
    const map = new Map<string, number>();
    shownPeriods.forEach((p, i) => {
      const b = dayBounds(p.start, p.end);
      for (const d of eachDay(b.first, b.last)) map.set(dayKey(d), i);
    });
    return map;
  }, [shownPeriods]);

  function toggle(d: Date) {
    if (!inPlan(d)) return;
    onPeriodsChange(toggleBillingDay(periods, d, makePeriod));
  }

  function dayUnderPointer(e: React.PointerEvent): Date | null {
    const el = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>("[data-day]");
    return el?.dataset.day ? fromDayKey(el.dataset.day) : null;
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const dayEl = target.closest<HTMLElement>("[data-day]");
    if (!dayEl?.dataset.day) return;
    const actionEl = target.closest<HTMLElement>("[data-action]");
    drag.current = {
      action: (actionEl?.dataset.action as DragAction | undefined) ?? "day",
      index: Number(actionEl?.dataset.index ?? -1),
      origin: fromDayKey(dayEl.dataset.day),
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.action === "day") return;
    const day = dayUnderPointer(e);
    if (!day) return;
    const delta = dayDiff(d.origin, day);
    if (delta !== 0) d.moved = true;
    if (!d.moved) return;

    const len = dayDiff(plan.start, plan.end);
    switch (d.action) {
      case "plan-start": {
        const n = Math.min(delta, len);
        setPreviewPlan({ start: addDays(plan.start, n), end: plan.end });
        break;
      }
      case "plan-end": {
        const n = Math.max(delta, -len);
        setPreviewPlan({ start: plan.start, end: addDays(plan.end, n) });
        break;
      }
      case "period-move":
      case "period-start":
      case "period-end": {
        const res = shiftPeriod(
          periods,
          d.index,
          d.action === "period-end" ? 0 : delta,
          d.action === "period-start" ? 0 : delta,
          plan
        );
        // Ungültige Position (außerhalb, Überschneidung) → letzte gültige bleibt.
        if (res) setPreviewPeriods(res);
        break;
      }
    }
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      if (previewPlan) onPlanChange(previewPlan);
      if (previewPeriods) onPeriodsChange(previewPeriods);
    } else if (d.action !== "plan-start" && d.action !== "plan-end") {
      toggle(d.origin);
    }
    setPreviewPlan(null);
    setPreviewPeriods(null);
  }

  function onPointerCancel() {
    drag.current = null;
    setPreviewPlan(null);
    setPreviewPeriods(null);
  }

  return (
    <div className="space-y-2">
      <div
        className="select-none overflow-hidden rounded-md border"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div className="grid grid-cols-7 bg-muted/50 text-center text-[11px] font-medium text-muted-foreground">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={dayKey(week[0])} className="grid grid-cols-7 border-t">
            {week.map((d, col) => {
              const key = dayKey(d);
              const planned = inPlan(d);
              const pIdx = dayToPeriod.get(key);
              const period = pIdx !== undefined ? shownPeriods[pIdx] : undefined;
              const bounds = period ? dayBounds(period.start, period.end) : null;
              const isFirst = bounds ? dayDiff(bounds.first, d) === 0 : false;
              const isLast = bounds ? dayDiff(d, bounds.last) === 0 : false;
              const isPlanStart = dayDiff(planFirst, d) === 0;
              const isPlanEnd = dayDiff(d, planLast) === 0;
              const showMonth = d.getDate() === 1 || (col === 0 && week === weeks[0]);

              return (
                <div
                  key={key}
                  data-day={key}
                  role={planned ? "button" : undefined}
                  tabIndex={planned ? 0 : undefined}
                  aria-label={
                    planned
                      ? `${dayFmt.format(d)}${period ? " – Berechnungstag" : ""}`
                      : undefined
                  }
                  aria-pressed={planned ? !!period : undefined}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(d);
                    }
                  }}
                  className={cn(
                    "relative h-16 border-l px-1.5 pt-1 text-xs first:border-l-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    planned
                      ? "cursor-pointer bg-info-subtle/50 hover:bg-info-subtle"
                      : "text-faint",
                    planned && isPlanStart && "pl-4"
                  )}
                >
                  <span className={cn(planned && "font-medium")}>
                    {showMonth && (
                      <span className="mr-1 font-semibold">{monthFmt.format(d)}</span>
                    )}
                    {d.getDate()}
                  </span>

                  {/* Planungszeitraum: Linie oben, Griffe an den Enden */}
                  {planned && (
                    <div
                      className={cn(
                        "pointer-events-none absolute inset-x-0 top-0 h-1 bg-info",
                        isPlanStart && "left-1 rounded-l-full",
                        isPlanEnd && "right-1 rounded-r-full"
                      )}
                    />
                  )}
                  {planned && isPlanStart && (
                    <div
                      data-action="plan-start"
                      title="Planungsstart ziehen"
                      className="absolute left-0 top-0 z-10 h-7 w-3 cursor-ew-resize touch-none"
                    >
                      <div className="ml-0.5 mt-0.5 h-5 w-1.5 rounded-full bg-info" />
                    </div>
                  )}
                  {planned && isPlanEnd && (
                    <div
                      data-action="plan-end"
                      title="Planungsende ziehen"
                      className="absolute right-0 top-0 z-10 h-7 w-3 cursor-ew-resize touch-none"
                    >
                      <div className="ml-auto mr-0.5 mt-0.5 h-5 w-1.5 rounded-full bg-info" />
                    </div>
                  )}

                  {/* Berechnungszeitraum als Balken */}
                  {period && pIdx !== undefined && (
                    <div
                      data-action="period-move"
                      data-index={pIdx}
                      title={`${periodLabel(period, pIdx)} – ziehen zum Verschieben, Klick entfernt den Tag`}
                      className={cn(
                        "absolute bottom-1.5 flex h-6 cursor-grab touch-none items-center overflow-hidden bg-primary px-1.5 text-[10px] font-medium text-primary-foreground active:cursor-grabbing",
                        isFirst ? "left-1 rounded-l-md" : "left-0",
                        isLast ? "right-1 rounded-r-md" : "right-0"
                      )}
                    >
                      {(isFirst || col === 0) && (
                        <span className="truncate">{periodLabel(period, pIdx)}</span>
                      )}
                      {isFirst && (
                        <div
                          data-action="period-start"
                          data-index={pIdx}
                          title="Start ziehen"
                          className="absolute inset-y-0 left-0 w-2 cursor-ew-resize"
                        />
                      )}
                      {isLast && (
                        <div
                          data-action="period-end"
                          data-index={pIdx}
                          title="Ende ziehen"
                          className="absolute inset-y-0 right-0 w-2 cursor-ew-resize"
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Klick auf einen Tag: Berechnungstag an/aus · Balken ziehen: verschieben · Enden ziehen:
        Länge ändern · Blaue Griffe: Planungszeitraum anpassen
      </p>
    </div>
  );
}
