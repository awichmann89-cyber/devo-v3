"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import { cn, formatDate } from "@/lib/utils";
import { projectStatusLabel } from "@/lib/labels";
import {
  getCableTimeline,
  getDeviceTimeline,
  type ItemTimeline,
  type TimelineBooking,
} from "./timeline-actions";

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const DAY_PX = 30;
const LABEL_PX = 190;

/** Lokale Tagesmitternacht. */
function dayFloor(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function buildDays(startIso: string, endIso: string): Date[] {
  const days: Date[] = [];
  const end = dayFloor(new Date(endIso));
  for (let d = dayFloor(new Date(startIso)); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }
  return days;
}

/** Index des Tages, in den `iso` fällt — auf das Fenster geklemmt. */
function dayIndex(days: Date[], iso: string): number {
  const t = dayFloor(new Date(iso)).getTime();
  const idx = days.findIndex((d) => d.getTime() === t);
  if (idx !== -1) return idx;
  return t < days[0].getTime() ? 0 : days.length - 1;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getTime() === dayFloor(b).getTime();
}

/** Balkenfarbe — eigenes Projekt hervorgehoben, sonst wie im Kalender nach Status. */
function barClass(b: TimelineBooking): string {
  if (b.isOwn) return "bg-primary text-primary-foreground";
  const byStatus: Record<ProjectStatus, string> = {
    ACTIVE: "bg-info text-white",
    CONFIRMED: "bg-success text-white",
    INVOICED: "bg-warning text-white",
    DRAFT: "border border-dashed border-muted-foreground bg-muted text-foreground",
    COMPLETED: "bg-faint text-white",
    CANCELLED: "bg-destructive/60 text-white line-through",
  };
  return byStatus[b.status];
}

interface Props {
  kind: "DEVICE" | "CABLE";
  projectId: string;
  itemId: string;
  /** Ändert sich (z.B. mit der gebuchten Menge) → Daten neu laden. */
  refreshKey?: string | number;
}

/**
 * Aufklappbarer Belegungs-Zeitstrahl einer gebuchten Material-Zeile: zeigt pro
 * Tag, wie viele Stück frei sind, und darunter als Balken alle Projekte, die das
 * Gerät/Kabel im Zeitraum (± eine Woche) belegen — mit Stückzahl.
 */
export function BookingTimeline({ kind, projectId, itemId, refreshKey }: Props) {
  const [data, setData] = useState<ItemTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const load = kind === "DEVICE" ? getDeviceTimeline : getCableTimeline;
    load(projectId, itemId)
      .then((res) => !cancelled && setData(res))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [kind, projectId, itemId, refreshKey]);

  const view = useMemo(() => {
    if (!data) return null;
    const days = buildDays(data.windowStart, data.windowEnd);
    const projStartIdx = dayIndex(days, data.projectStart);
    const projEndIdx = dayIndex(days, data.projectEnd);
    // Belegung pro Tag: alle Buchungen, deren Zeitraum den Tag berührt.
    // `firm` lässt fremde Entwürfe weg: Überbuchung nur durch Entwürfe ist
    // bloß möglich (gelb), erst feste Buchungen machen sie rot.
    const usage = (onlyFirm: boolean) =>
      days.map((day) => {
        const next = new Date(day);
        next.setDate(next.getDate() + 1);
        return data.bookings.reduce((sum, b) => {
          if (onlyFirm && !b.isOwn && b.status === "DRAFT") return sum;
          const s = new Date(b.start);
          const e = new Date(b.end);
          return s < next && e >= day ? sum + b.effectiveQuantity : sum;
        }, 0);
      });
    const used = usage(false);
    const firm = usage(true);
    let peak = 0;
    let firmPeak = 0;
    for (let i = projStartIdx; i <= projEndIdx; i++) {
      peak = Math.max(peak, used[i]);
      firmPeak = Math.max(firmPeak, firm[i]);
    }
    return { days, used, firm, projStartIdx, projEndIdx, peak, firmPeak };
  }, [data]);

  if (error) {
    return (
      <p className="px-2 py-3 text-xs text-destructive">
        Belegung konnte nicht geladen werden: {error}
      </p>
    );
  }
  if (!data || !view) {
    return (
      <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Belegung wird geladen…
      </div>
    );
  }

  const { days, used, firm, projStartIdx, projEndIdx, peak, firmPeak } = view;
  const missing = peak - data.capacity;
  // Fehlt auch ohne Entwürfe etwas → rot, sonst nur mögliche Überschneidung.
  const firmMissing = firmPeak - data.capacity;
  const today = new Date();
  const gridStyle: CSSProperties = {
    gridTemplateColumns: `${LABEL_PX}px repeat(${days.length}, ${DAY_PX}px)`,
  };
  const inProject = (i: number) => i >= projStartIdx && i <= projEndIdx;
  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
  /** Gemeinsamer Hintergrund einer Tages-Zelle (Projektzeitraum, Wochenende). */
  const dayBg = (d: Date, i: number) =>
    cn(
      "border-l border-border/60",
      inProject(i) ? "bg-primary/[0.06]" : isWeekend(d) && "bg-muted/50"
    );

  return (
    <div className="space-y-2 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        <span>
          Bestand <span className="font-semibold text-foreground">{data.stock}</span>
          {data.packAllocation > 0 && (
            <> (davon {data.packAllocation} fest in Packeinheiten)</>
          )}
        </span>
        <span>
          Höchste Belegung im Projektzeitraum:{" "}
          <span
            className={cn(
              "font-semibold",
              firmMissing > 0 ? "text-destructive" : missing > 0 ? "text-warning" : "text-foreground"
            )}
          >
            {peak} / {data.capacity}
          </span>
        </span>
        {missing > 0 && (
          <span
            className={cn(
              "flex items-center gap-1 font-medium",
              firmMissing > 0 ? "text-destructive" : "text-warning"
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {firmMissing > 0
              ? `${missing} fehlen`
              : `${missing} fehlen, falls Entwürfe bestätigt werden`}
          </span>
        )}
        <span className="ml-auto flex items-center gap-3 text-[11px]">
          <Legend className="bg-primary" label="Dieses Projekt" />
          <Legend className="bg-info" label="Aktiv" />
          <Legend className="bg-success" label="Bestätigt" />
          <Legend className="border border-dashed border-muted-foreground bg-muted" label="Entwurf" />
        </span>
      </div>

      {/* `w-0 min-w-full`: der Zeitstrahl darf die Material-Tabelle nicht
          verbreitern, sondern scrollt in sich horizontal. */}
      <div className="w-0 min-w-full overflow-x-auto rounded-md border bg-background">
        <div className="grid w-max text-[11px]" style={gridStyle}>
          {/* Kopfzeile: Datum */}
          <div className="sticky left-0 z-20 border-b bg-background px-2 py-1 font-medium text-muted-foreground">
            {MONTHS[days[0].getMonth()]} {days[0].getFullYear()}
          </div>
          {days.map((d, i) => (
            <div
              key={`h${i}`}
              className={cn(
                "border-b py-0.5 text-center leading-tight",
                dayBg(d, i),
                sameDay(d, today) && "font-bold text-primary"
              )}
              title={formatDate(d)}
            >
              <div className="text-[10px] text-muted-foreground">
                {d.getDate() === 1 ? MONTHS[d.getMonth()] : WEEKDAYS[d.getDay()]}
              </div>
              <div className="num">{d.getDate()}</div>
            </div>
          ))}

          {/* Frei pro Tag */}
          <div className="sticky left-0 z-20 border-b bg-background px-2 py-1 font-medium">
            Frei
          </div>
          {days.map((d, i) => {
            const free = data.capacity - used[i];
            const firmFree = data.capacity - firm[i];
            return (
              <div
                key={`f${i}`}
                className={cn(
                  "num flex items-center justify-center border-b py-1 font-semibold",
                  "border-l border-border/60",
                  firmFree < 0
                    ? "bg-destructive-subtle text-destructive"
                    : free <= 0
                      ? "bg-warning-subtle text-warning"
                      : "bg-success-subtle text-success",
                  !inProject(i) && "opacity-60"
                )}
                title={
                  `${formatDate(d)}: ${used[i]} von ${data.capacity} belegt, ${free} frei` +
                  (free < 0 && firmFree >= 0 ? " (nur durch Entwürfe überbucht)" : "")
                }
              >
                {free}
              </div>
            );
          })}

          {/* Ein Balken pro belegendem Projekt */}
          {data.bookings.map((b, row) => {
            const gridRow = row + 3;
            const s = dayIndex(days, b.start);
            const e = dayIndex(days, b.end);
            const clippedLeft = new Date(b.start) < days[0];
            const clippedRight = dayFloor(new Date(b.end)) > days[days.length - 1];
            const qtyLabel =
              b.effectiveQuantity > b.quantity
                ? `${b.quantity} Stk. (${b.effectiveQuantity} belegt)`
                : `${b.quantity} Stk.`;
            return (
              <div key={b.projectId} className="contents">
                <div
                  className={cn(
                    "sticky left-0 z-20 flex min-w-0 items-center border-b bg-background px-2 py-1",
                    b.isOwn && "font-semibold"
                  )}
                  style={{ gridRow, gridColumn: 1 }}
                  title={`${b.projectName} · ${projectStatusLabel(b.status)} · ${formatDate(b.start)} – ${formatDate(b.end)}`}
                >
                  {b.isOwn ? (
                    <span className="truncate">{b.projectName}</span>
                  ) : (
                    <Link
                      href={`/projects/${b.projectId}`}
                      className="truncate hover:underline"
                    >
                      {b.projectName}
                    </Link>
                  )}
                </div>
                {days.map((d, i) => (
                  <div
                    key={`c${row}-${i}`}
                    className={cn("border-b", dayBg(d, i))}
                    style={{ gridRow, gridColumn: i + 2 }}
                  />
                ))}
                <div
                  className={cn(
                    "z-10 mx-px my-1 flex min-w-0 items-center overflow-hidden whitespace-nowrap px-1.5 font-medium",
                    !clippedLeft && "rounded-l",
                    !clippedRight && "rounded-r",
                    barClass(b)
                  )}
                  style={{ gridRow, gridColumn: `${s + 2} / ${e + 3}` }}
                  title={`${b.projectName}: ${qtyLabel} · ${projectStatusLabel(b.status)} · ${formatDate(b.start)} – ${formatDate(b.end)}`}
                >
                  <span className="truncate">{qtyLabel}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("inline-block h-2.5 w-2.5 rounded-sm", className)} />
      {label}
    </span>
  );
}
