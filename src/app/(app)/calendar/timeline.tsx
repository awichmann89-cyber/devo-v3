"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight, Boxes, ChevronLeft, ChevronRight, UserRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { cn, formatDate } from "@/lib/utils";
import { ProjectStatus } from "@prisma/client";
import { projectStatusLabel, projectStatusVariant } from "@/lib/labels";

interface ProjectVM {
  id: string;
  name: string;
  customer: string | null;
  status: ProjectStatus;
  planningStart: string;
  planningEnd: string;
  deviceCount: number;
}

/** Eigener Einsatz des eingeloggten Nutzers — als Chip im Kalender-Grid. */
export interface MyAssignmentVM {
  id: string;
  projectId: string;
  projectName: string;
  status: ProjectStatus;
  serviceName: string;
  start: string; // ISO
  end: string; // ISO
  timed: boolean;
  notes: string | null;
}

/** Zeitfenster-Label eines Einsatzes für das Info-Popup. */
function assignmentTimeLabel(a: MyAssignmentVM): string {
  const s = new Date(a.start);
  const e = new Date(a.end);
  const time = (d: Date) =>
    d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (!a.timed) {
    return formatDate(s) === formatDate(e)
      ? `${formatDate(s)} (ganztägig)`
      : `${formatDate(s)} – ${formatDate(e)} (ganztägig)`;
  }
  return s.toDateString() === e.toDateString()
    ? `${formatDate(s)}, ${time(s)}–${time(e)} Uhr`
    : `${formatDate(s)} ${time(s)} – ${formatDate(e)} ${time(e)}`;
}

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

// Status → Hintergrundfarbe für die Projekt-Chips im Kalender
function projectChipClass(status: ProjectStatus): string {
  switch (status) {
    case "ACTIVE":
      return "bg-info hover:bg-info text-white";
    case "CONFIRMED":
      return "bg-success hover:bg-success text-white";
    case "DRAFT":
      return "bg-muted-foreground hover:bg-muted-foreground text-white";
    case "COMPLETED":
      return "bg-faint hover:bg-faint text-white";
    case "CANCELLED":
      return "bg-destructive/60 hover:bg-destructive/80 text-white line-through";
    default:
      return "bg-muted-foreground text-white";
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
  myAssignments = [],
}: {
  viewStart: string;
  /** kept for API compat — wird ignoriert, der MonthCalendar leitet alles aus viewStart ab */
  viewEnd?: string;
  projects: ProjectVM[];
  /** Einsätze des eingeloggten Nutzers (verknüpfte Person) — eigene Chips. */
  myAssignments?: MyAssignmentVM[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const start = useMemo(() => new Date(viewStart), [viewStart]);

  const [statusFilter, setStatusFilter] = useState<string>("active");
  // Info-Popup: angeklickter Kalendereintrag (Projekt oder eigener Einsatz)
  const [selected, setSelected] = useState<
    | { kind: "project"; project: ProjectVM }
    | { kind: "assignment"; assignment: MyAssignmentVM }
    | null
  >(null);

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
          // Eigene Einsätze zuerst — sie sind die persönlich relevanteste Info.
          const assignmentsOnDay = myAssignments.filter((a) =>
            isInRange(day, a.start, a.end)
          );
          const VISIBLE = 3;
          const visibleAssignments = assignmentsOnDay.slice(0, VISIBLE);
          const remaining = Math.max(0, VISIBLE - visibleAssignments.length);
          const visibleProjects = projectsOnDay.slice(0, remaining);
          const overflow =
            assignmentsOnDay.length +
            projectsOnDay.length -
            visibleAssignments.length -
            visibleProjects.length;
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
                {visibleAssignments.map((a) => (
                  <button
                    key={`assignment:${a.id}`}
                    type="button"
                    onClick={() => setSelected({ kind: "assignment", assignment: a })}
                    title={`Mein Einsatz: ${a.projectName} — ${a.serviceName}`}
                    className="flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium text-white shadow-sm bg-fuchsia-600 hover:bg-fuchsia-500"
                  >
                    <UserRound className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">{a.projectName}</span>
                  </button>
                ))}
                {visibleProjects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelected({ kind: "project", project: p })}
                    title={`${p.name}${p.customer ? " · " + p.customer : ""} (${projectStatusLabel(p.status)})`}
                    className={cn(
                      "truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium shadow-sm transition-opacity",
                      projectChipClass(p.status)
                    )}
                  >
                    {p.name}
                  </button>
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
        <LegendItem color="bg-muted-foreground" label="Entwurf" />
        <LegendItem color="bg-success" label="Bestätigt" />
        <LegendItem color="bg-info" label="Aktiv" />
        <LegendItem color="bg-faint" label="Abgeschlossen" />
        <LegendItem color="bg-destructive/60" label="Storniert" />
        {myAssignments.length > 0 && (
          <LegendItem color="bg-fuchsia-600" label="Meine Einsätze" />
        )}
      </div>

      {/* Info-Popup: gebündelte Infos + Button zum Projekt (wie im ICS-Kalender,
          nur mit Absprung ins Projekt). */}
      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md">
          {selected?.kind === "project" && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.project.name}</DialogTitle>
                <DialogDescription>
                  {selected.project.customer ?? "Ohne Kunde"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant={projectStatusVariant(selected.project.status)}>
                    {projectStatusLabel(selected.project.status)}
                  </Badge>
                </div>
                <p>
                  <span className="text-muted-foreground">Planungszeitraum: </span>
                  {formatDate(selected.project.planningStart)} –{" "}
                  {formatDate(selected.project.planningEnd)}
                </p>
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <Boxes className="h-4 w-4" />
                  {selected.project.deviceCount} Geräte gebucht
                </p>
              </div>
              <DialogFooter>
                <Button asChild>
                  <Link href={`/projects/${selected.project.id}`}>
                    Zum Projekt <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </DialogFooter>
            </>
          )}
          {selected?.kind === "assignment" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <UserRound className="h-4 w-4" />
                  Mein Einsatz — {selected.assignment.projectName}
                </DialogTitle>
                <DialogDescription>{selected.assignment.serviceName}</DialogDescription>
              </DialogHeader>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant={projectStatusVariant(selected.assignment.status)}>
                    {projectStatusLabel(selected.assignment.status)}
                  </Badge>
                </div>
                <p>
                  <span className="text-muted-foreground">Zeit: </span>
                  {assignmentTimeLabel(selected.assignment)}
                </p>
                {selected.assignment.notes && (
                  <p className="text-muted-foreground">
                    📝 {selected.assignment.notes}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button asChild>
                  <Link href={`/projects/${selected.assignment.projectId}`}>
                    Zum Projekt <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
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
