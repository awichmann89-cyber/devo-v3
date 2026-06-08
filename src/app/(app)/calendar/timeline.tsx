"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ProjectStatus } from "@prisma/client";
import { projectStatusLabel } from "@/lib/labels";

interface ProjectVM {
  id: string;
  name: string;
  customer: string | null;
  status: ProjectStatus;
  planningStart: string;
  planningEnd: string;
  deviceCount: number;
}

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

// Status → Hintergrundfarbe für die Projekt-Chips im Kalender
function projectChipClass(status: ProjectStatus): string {
  switch (status) {
    case "ACTIVE":
      return "bg-blue-600 hover:bg-blue-700 text-white";
    case "CONFIRMED":
      return "bg-emerald-600 hover:bg-emerald-700 text-white";
    case "DRAFT":
      return "bg-slate-500 hover:bg-slate-600 text-white";
    case "COMPLETED":
      return "bg-zinc-400 hover:bg-zinc-500 text-white";
    case "CANCELLED":
      return "bg-red-600/60 hover:bg-red-600/80 text-white line-through";
    default:
      return "bg-slate-500 text-white";
  }
}

/**
 * Liefert die 42 Tage (6 Wochen) für das angezeigte Monatsgitter, beginnend
 * mit dem Montag der Woche, in der der 1. des Monats liegt.
 */
function buildMonthGrid(viewStart: Date): Date[] {
  const firstOfMonth = new Date(
    viewStart.getFullYear(),
    viewStart.getMonth(),
    1
  );
  // getDay(): 0=So, 1=Mo, ..., 6=Sa  → wir wollen Mo=0, So=6
  const offsetFromMonday = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - offsetFromMonday);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    d.setHours(0, 0, 0, 0);
    return d;
  });
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isInRange(day: Date, startISO: string, endISO: string): boolean {
  const s = new Date(startISO);
  s.setHours(0, 0, 0, 0);
  const e = new Date(endISO);
  e.setHours(0, 0, 0, 0);
  return day >= s && day <= e;
}

export function Timeline({
  viewStart,
  projects,
}: {
  viewStart: string;
  /** kept for API compat — wird ignoriert, der MonthCalendar leitet alles aus viewStart ab */
  viewEnd?: string;
  projects: ProjectVM[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const start = useMemo(() => new Date(viewStart), [viewStart]);

  const [statusFilter, setStatusFilter] = useState<string>("active");

  const filtered = useMemo(
    () =>
      projects.filter((p) => {
        if (statusFilter === "all") return true;
        if (statusFilter === "active") {
          return (
            p.status === "DRAFT" ||
            p.status === "CONFIRMED" ||
            p.status === "ACTIVE"
          );
        }
        return p.status === statusFilter;
      }),
    [projects, statusFilter]
  );

  const grid = useMemo(() => buildMonthGrid(start), [start]);
  const currentMonth = start.getMonth();

  function shiftMonth(delta: number) {
    const newStart = new Date(start.getFullYear(), start.getMonth() + delta, 1);
    const p = new URLSearchParams(params.toString());
    p.set(
      "month",
      `${newStart.getFullYear()}-${String(newStart.getMonth() + 1).padStart(2, "0")}`
    );
    router.push(`/calendar?${p.toString()}`);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthLabel = start.toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)} title="Vormonat">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={() => shiftMonth(1)} title="Nächster Monat">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => router.push("/calendar")}>
          Heute
        </Button>
        <span className="ml-2 text-base font-semibold capitalize">{monthLabel}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Status:</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Aktive Projekte</SelectItem>
              <SelectItem value="all">Alle Projekte</SelectItem>
              {Object.values(ProjectStatus).map((s) => (
                <SelectItem key={s} value={s}>
                  {projectStatusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Wochentag-Header */}
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border bg-border">
        {WEEKDAYS.map((wd) => (
          <div
            key={wd}
            className="bg-muted/60 px-2 py-1.5 text-center text-xs font-semibold text-muted-foreground"
          >
            {wd}
          </div>
        ))}
        {/* Day-Cells */}
        {grid.map((day) => {
          const isOtherMonth = day.getMonth() !== currentMonth;
          const isToday = sameDay(day, today);
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
          const projectsOnDay = filtered.filter((p) =>
            isInRange(day, p.planningStart, p.planningEnd)
          );
          const VISIBLE = 3;
          const visible = projectsOnDay.slice(0, VISIBLE);
          const overflow = projectsOnDay.length - VISIBLE;
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-[120px] bg-card p-1.5 flex flex-col gap-1",
                isOtherMonth && "bg-muted/30 text-muted-foreground",
                isWeekend && !isOtherMonth && "bg-muted/20",
                isToday && "ring-2 ring-inset ring-primary"
              )}
            >
              <div
                className={cn(
                  "text-xs font-medium",
                  isToday && "text-primary font-bold"
                )}
              >
                {day.getDate()}
                {day.getDate() === 1 && (
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    {day.toLocaleDateString("de-DE", { month: "short" })}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                {visible.map((p) => (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    title={`${p.name}${p.customer ? " · " + p.customer : ""} (${projectStatusLabel(p.status)})`}
                    className={cn(
                      "truncate rounded px-1.5 py-0.5 text-[10px] font-medium shadow-sm transition-opacity",
                      projectChipClass(p.status)
                    )}
                  >
                    {p.name}
                  </Link>
                ))}
                {overflow > 0 && (
                  <div className="px-1 text-[10px] text-muted-foreground">
                    + {overflow} weitere
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legende */}
      <div className="flex flex-wrap gap-4 text-xs">
        <LegendItem color="bg-slate-500" label="Entwurf" />
        <LegendItem color="bg-emerald-600" label="Bestätigt" />
        <LegendItem color="bg-blue-600" label="Aktiv" />
        <LegendItem color="bg-zinc-400" label="Abgeschlossen" />
        <LegendItem color="bg-red-600/60" label="Storniert" />
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn("h-3 w-3 rounded", color)} />
      <span>{label}</span>
    </div>
  );
}
