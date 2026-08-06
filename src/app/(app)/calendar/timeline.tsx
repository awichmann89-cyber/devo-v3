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
import {
  projectStatusEmoji,
  projectStatusLabel,
  projectStatusVariant,
} from "@/lib/labels";

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

/** ISO-Zeitpunkt → lokale Tagesmitternacht (für die Tag-Raster-Zuordnung). */
function dayFloor(iso: string): Date {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Kalender-Eintrag für die Balken-Darstellung (Projekt oder eigener Einsatz). */
type CalEvent = {
  key: string;
  kind: "project" | "assignment";
  start: Date; // Tagesmitternacht inklusiv
  end: Date; // Tagesmitternacht inklusiv
  label: string;
  chip: string;
  project?: ProjectVM;
  assignment?: MyAssignmentVM;
};

/** Balken-Segment eines Events innerhalb EINER Woche. */
type WeekSegment = {
  ev: CalEvent;
  startCol: number; // 0-basiert
  endCol: number; // 0-basiert, inklusiv
  startsHere: boolean; // Event beginnt in dieser Woche (echte linke Kante)
  endsHere: boolean; // Event endet in dieser Woche (echte rechte Kante)
  lane: number;
};

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

  // Alle Kalender-Einträge als Balken-Events (Tag-genau normalisiert).
  // Einsätze zuerst — sie bekommen bevorzugt die oberste Lane.
  const events = useMemo<CalEvent[]>(() => {
    const evts: CalEvent[] = myAssignments.map((a) => ({
      key: `a:${a.id}`,
      kind: "assignment" as const,
      start: dayFloor(a.start),
      end: dayFloor(a.end),
      label: `${projectStatusEmoji(a.status)} ${a.projectName} — ${a.serviceName}`,
      chip: "bg-subhire text-primary-foreground hover:opacity-90",
      assignment: a,
    }));
    for (const p of filtered) {
      evts.push({
        key: `p:${p.id}`,
        kind: "project" as const,
        start: dayFloor(p.planningStart),
        end: dayFloor(p.planningEnd),
        label: `${projectStatusEmoji(p.status)} ${p.name}`,
        chip: projectChipClass(p.status),
        project: p,
      });
    }
    return evts;
  }, [filtered, myAssignments]);

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

      {/* Monatsgitter: pro Woche eine Grid-Zeile, Events als durchgehende
          Balken über alle betroffenen Spalten (Lane-Layout wie in
          Kalender-Apps). Balken, die über die Woche hinauslaufen, verlieren
          an der Schnittkante ihre Rundung. */}
      <div className="overflow-hidden rounded-md border bg-border">
        <div className="grid grid-cols-7 gap-px">
          {WEEKDAYS.map((wd) => (
            <div
              key={wd}
              className="bg-muted/60 px-2 py-1.5 text-center text-xs font-semibold text-muted-foreground"
            >
              {wd}
            </div>
          ))}
        </div>
        {Array.from({ length: 6 }, (_, w) => {
          const weekDays = grid.slice(w * 7, w * 7 + 7);
          const weekStart = weekDays[0];
          const weekEnd = weekDays[6];

          // Segmente aller Events, die diese Woche berühren.
          const segs: WeekSegment[] = [];
          for (const ev of events) {
            if (ev.end < weekStart || ev.start > weekEnd) continue;
            const startCol =
              ev.start <= weekStart
                ? 0
                : Math.round((+ev.start - +weekStart) / DAY_MS);
            const endCol =
              ev.end >= weekEnd ? 6 : Math.round((+ev.end - +weekStart) / DAY_MS);
            segs.push({
              ev,
              startCol,
              endCol,
              startsHere: ev.start >= weekStart,
              endsHere: ev.end <= weekEnd,
              lane: -1,
            });
          }
          // Lane-Zuordnung: Einsätze zuerst, dann nach Startspalte / Länge.
          segs.sort((a, b) => {
            if (a.ev.kind !== b.ev.kind) return a.ev.kind === "assignment" ? -1 : 1;
            return (
              a.startCol - b.startCol ||
              (b.endCol - b.startCol) - (a.endCol - a.startCol)
            );
          });
          const lanes: WeekSegment[][] = [];
          for (const s of segs) {
            const free = lanes.findIndex((lane) =>
              lane.every((o) => o.endCol < s.startCol || o.startCol > s.endCol)
            );
            if (free >= 0) {
              s.lane = free;
              lanes[free].push(s);
            } else {
              s.lane = lanes.length;
              lanes.push([s]);
            }
          }
          const MAX_LANES = 4;
          const shownLaneCount = Math.min(lanes.length, MAX_LANES);
          // Überlauf pro Tag (Events in versteckten Lanes).
          const hiddenPerDay = Array(7).fill(0) as number[];
          for (const s of segs) {
            if (s.lane < MAX_LANES) continue;
            for (let c = s.startCol; c <= s.endCol; c++) hiddenPerDay[c]++;
          }

          return (
            <div
              key={w}
              className="mt-px grid min-h-[120px] grid-cols-7 gap-px bg-border"
              style={{
                gridTemplateRows: `1.5rem repeat(${shownLaneCount}, 1.5rem) minmax(0.375rem, 1fr)`,
              }}
            >
              {/* Hintergrund-Zellen (über alle Zeilen der Woche) */}
              {weekDays.map((day, i) => {
                const isOtherMonth = day.getMonth() !== currentMonth;
                const isToday = sameDay(day, today);
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                return (
                  <div
                    key={`bg:${day.toISOString()}`}
                    style={{ gridColumn: `${i + 1} / ${i + 2}`, gridRow: "1 / -1" }}
                    className={cn(
                      "bg-card",
                      isOtherMonth && "bg-muted/30",
                      isWeekend && !isOtherMonth && "bg-muted/20",
                      isToday && "ring-2 ring-inset ring-primary"
                    )}
                  />
                );
              })}
              {/* Tages-Nummern */}
              {weekDays.map((day, i) => {
                const isOtherMonth = day.getMonth() !== currentMonth;
                const isToday = sameDay(day, today);
                return (
                  <div
                    key={`nr:${day.toISOString()}`}
                    style={{ gridColumn: `${i + 1} / ${i + 2}`, gridRow: 1 }}
                    className={cn(
                      "z-10 px-1.5 pt-1 text-xs font-medium",
                      isOtherMonth && "text-muted-foreground",
                      isToday && "font-bold text-primary"
                    )}
                  >
                    {day.getDate()}
                    {day.getDate() === 1 && (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        {day.toLocaleDateString("de-DE", { month: "short" })}
                      </span>
                    )}
                  </div>
                );
              })}
              {/* Event-Balken */}
              {segs
                .filter((s) => s.lane < MAX_LANES)
                .map((s) => (
                  <button
                    key={`${s.ev.key}:${w}`}
                    type="button"
                    onClick={() =>
                      s.ev.kind === "assignment"
                        ? setSelected({ kind: "assignment", assignment: s.ev.assignment! })
                        : setSelected({ kind: "project", project: s.ev.project! })
                    }
                    title={s.ev.label}
                    style={{
                      gridColumn: `${s.startCol + 1} / ${s.endCol + 2}`,
                      gridRow: s.lane + 2,
                    }}
                    className={cn(
                      "z-10 my-0.5 flex min-w-0 items-center gap-1 overflow-hidden rounded px-1.5 text-left text-[10px] font-medium shadow-sm",
                      s.ev.chip,
                      s.startsHere ? "ml-0.5" : "ml-0 rounded-l-none",
                      s.endsHere ? "mr-0.5" : "mr-0 rounded-r-none"
                    )}
                  >
                    {s.ev.kind === "assignment" && (
                      <UserRound className="h-2.5 w-2.5 shrink-0" />
                    )}
                    <span className="truncate">{s.ev.label}</span>
                  </button>
                ))}
              {/* Überlauf pro Tag */}
              {hiddenPerDay.map(
                (n, i) =>
                  n > 0 && (
                    <div
                      key={`ovf:${i}`}
                      style={{
                        gridColumn: `${i + 1} / ${i + 2}`,
                        gridRow: shownLaneCount + 2,
                      }}
                      className="z-10 px-1.5 text-[10px] text-muted-foreground"
                    >
                      + {n} weitere
                    </div>
                  )
              )}
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
          <LegendItem color="bg-subhire" label="Meine Einsätze" />
        )}
      </div>

      {/* Info-Popup: gebündelte Infos + Button zum Projekt (wie im ICS-Kalender,
          nur mit Absprung ins Projekt). */}
      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent size="sm">
          {selected?.kind === "project" && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {projectStatusEmoji(selected.project.status)} {selected.project.name}
                </DialogTitle>
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
                  {projectStatusEmoji(selected.assignment.status)} Mein Einsatz —{" "}
                  {selected.assignment.projectName}
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
