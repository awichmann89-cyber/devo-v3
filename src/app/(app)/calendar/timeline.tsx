"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Package } from "lucide-react";
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

export function Timeline({
  viewStart,
  viewEnd,
  projects,
}: {
  viewStart: string;
  viewEnd: string;
  projects: ProjectVM[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const start = new Date(viewStart);
  const end = new Date(viewEnd);

  const [statusFilter, setStatusFilter] = useState<string>("active");

  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const dayWidth = 28; // px

  const filtered = projects.filter((p) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "active") {
      return p.status === "DRAFT" || p.status === "CONFIRMED" || p.status === "ACTIVE";
    }
    return p.status === statusFilter;
  });

  function dayOffset(d: Date): number {
    return Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  }

  function shiftMonth(delta: number) {
    const newStart = new Date(start.getFullYear(), start.getMonth() + delta, 1);
    const p = new URLSearchParams(params.toString());
    p.set("month", `${newStart.getFullYear()}-${String(newStart.getMonth() + 1).padStart(2, "0")}`);
    router.push(`/calendar?${p.toString()}`);
  }

  // Header: Tage
  const days = Array.from({ length: totalDays }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={() => shiftMonth(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => router.push("/calendar")}>
          Heute
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Status:</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Aktive (Entwurf/Bestätigt/Aktiv)</SelectItem>
              <SelectItem value="all">Alle</SelectItem>
              {Object.values(ProjectStatus).map((s) => (
                <SelectItem key={s} value={s}>
                  {projectStatusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <div className="inline-block min-w-full">
          {/* Header Row */}
          <div className="sticky top-0 z-10 flex border-b bg-muted/50">
            <div className="w-72 shrink-0 border-r px-3 py-2 text-xs font-medium">Projekt</div>
            <div className="flex">
              {days.map((d, i) => {
                const isToday = d.getTime() === today.getTime();
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const isFirstOfMonth = d.getDate() === 1;
                return (
                  <div
                    key={i}
                    className={cn(
                      "shrink-0 border-r text-center text-[10px] py-1",
                      isWeekend && "bg-muted",
                      isToday && "bg-primary/10 font-bold",
                    )}
                    style={{ width: dayWidth }}
                  >
                    {isFirstOfMonth && (
                      <div className="text-[9px] font-medium text-muted-foreground">
                        {d.toLocaleDateString("de-DE", { month: "short" })}
                      </div>
                    )}
                    <div>{d.getDate()}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Project Rows */}
          {filtered.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              Keine Projekte im Zeitraum
            </div>
          )}
          {filtered.map((p) => {
            const pStart = new Date(p.planningStart);
            const pEnd = new Date(p.planningEnd);
            const offStart = Math.max(0, dayOffset(pStart));
            const offEnd = Math.min(totalDays - 1, dayOffset(pEnd));
            const left = offStart * dayWidth + 2;
            const width = (offEnd - offStart + 1) * dayWidth - 4;

            return (
              <div key={p.id} className="flex border-b hover:bg-accent/30">
                <div className="w-72 shrink-0 border-r px-3 py-2">
                  <Link href={`/projects/${p.id}`} className="block">
                    <div className="truncate text-sm font-medium hover:underline">{p.name}</div>
                    {p.customer && (
                      <div className="truncate text-xs text-muted-foreground">{p.customer}</div>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <Badge variant="outline" className="text-[10px]">
                        {projectStatusLabel(p.status)}
                      </Badge>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Package className="h-3 w-3" /> {p.deviceCount}
                      </span>
                    </div>
                  </Link>
                </div>
                <div
                  className="relative flex"
                  style={{ width: totalDays * dayWidth, minHeight: 56 }}
                >
                  {/* Day grid */}
                  {days.map((d, i) => {
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    const isToday = d.getTime() === today.getTime();
                    return (
                      <div
                        key={i}
                        className={cn(
                          "shrink-0 border-r border-border/50",
                          isWeekend && "bg-muted/40",
                          isToday && "bg-primary/5",
                        )}
                        style={{ width: dayWidth }}
                      />
                    );
                  })}
                  {/* Projekt-Balken */}
                  <Link
                    href={`/projects/${p.id}`}
                    className={cn(
                      "absolute top-3 h-[36px] rounded-md px-3 py-1 text-xs font-medium text-white shadow truncate overflow-hidden transition-all hover:opacity-90 hover:shadow-md",
                      p.status === "ACTIVE" && "bg-blue-600",
                      p.status === "CONFIRMED" && "bg-emerald-600",
                      p.status === "DRAFT" && "bg-slate-500",
                      p.status === "COMPLETED" && "bg-zinc-400",
                      p.status === "CANCELLED" && "bg-red-600/60 line-through",
                    )}
                    style={{ left, width: Math.max(width, 4) }}
                    title={`${p.name} (${pStart.toLocaleDateString("de-DE")} – ${pEnd.toLocaleDateString("de-DE")})`}
                  >
                    <div className="truncate">{p.name}</div>
                    <div className="truncate text-[10px] opacity-80">
                      {pStart.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} –{" "}
                      {pEnd.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                    </div>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
