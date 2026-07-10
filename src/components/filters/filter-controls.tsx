"use client";

import { Check, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { projectStatusLabel } from "@/lib/labels";
import type { ProjectStatus } from "@prisma/client";

/**
 * Gemeinsame Bausteine der kompakten Filterleiste (Redesign) —
 * verwendet auf der Projekte- und der Forecast-Seite.
 */

export const FILTER_STATUS_ORDER: ProjectStatus[] = [
  "DRAFT",
  "CONFIRMED",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
];

// Default sichtbar: ohne CANCELLED — stornierte Projekte sind selten relevant.
export const FILTER_DEFAULT_STATUSES: ProjectStatus[] = [
  "DRAFT",
  "CONFIRMED",
  "ACTIVE",
  "COMPLETED",
];

/** Getönte Chip-Klassen je Status — analog zu den Badge-Varianten. */
export function statusChipClass(s: ProjectStatus): string {
  return {
    DRAFT: "bg-accent text-muted-foreground",
    CONFIRMED: "bg-info-subtle text-info",
    ACTIVE: "bg-primary-subtle text-primary",
    COMPLETED: "bg-success-subtle text-success",
    CANCELLED: "bg-destructive-subtle text-destructive",
  }[s];
}

/** Suchfeld mit Lupe. */
export function FilterSearch({
  value,
  onChange,
  placeholder = "Suchen…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[34px] w-[210px] pl-8"
      />
    </div>
  );
}

/** Von/Bis-Datumsfelder + Zeitraum-Preset — wirkt sofort (kein »Anwenden«). */
export function DateRangeControls({
  from,
  to,
  onRangeChange,
  onPreset,
}: {
  from: string;
  to: string;
  onRangeChange: (from: string, to: string) => void;
  onPreset: (months: number) => void;
}) {
  return (
    <>
      <Input
        type="date"
        aria-label="Von"
        value={from}
        onChange={(e) => onRangeChange(e.target.value, to)}
        className="h-[34px] w-[144px]"
      />
      <span className="text-xs text-faint">bis</span>
      <Input
        type="date"
        aria-label="Bis"
        value={to}
        onChange={(e) => onRangeChange(from, e.target.value)}
        className="h-[34px] w-[144px]"
      />
      <Select value="" onValueChange={(v) => onPreset(Number(v))}>
        <SelectTrigger className="h-[34px] w-[130px] text-xs text-muted-foreground">
          <SelectValue placeholder="Zeitraum…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Aktueller Monat</SelectItem>
          <SelectItem value="3">3 Monate</SelectItem>
          <SelectItem value="6">6 Monate</SelectItem>
          <SelectItem value="12">12 Monate</SelectItem>
        </SelectContent>
      </Select>
    </>
  );
}

/** Getönte Status-Chips (Mehrfachauswahl). */
export function StatusChips({
  selected,
  onToggle,
}: {
  selected: Set<ProjectStatus>;
  onToggle: (s: ProjectStatus) => void;
}) {
  return (
    <>
      {FILTER_STATUS_ORDER.map((s) => {
        const active = selected.has(s);
        return (
          <button
            key={s}
            type="button"
            onClick={() => onToggle(s)}
            title={active ? "Status ausblenden" : "Status einblenden"}
            className={cn(
              "inline-flex h-[26px] items-center gap-1 rounded-[5px] px-2.5 text-xs font-semibold transition-colors",
              active
                ? statusChipClass(s)
                : "border border-dashed border-input font-medium text-muted-foreground hover:border-primary hover:text-primary",
            )}
          >
            {active && <Check className="h-3 w-3" />}
            {projectStatusLabel(s)}
          </button>
        );
      })}
    </>
  );
}

/** Zurücksetzen-Chip — nur anzeigen, wenn Filter vom Standard abweichen. */
export function FilterResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Filter zurücksetzen"
      className="inline-flex h-[26px] items-center gap-1 rounded-[5px] px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive-subtle hover:text-destructive"
    >
      <X className="h-3.5 w-3.5" /> Zurücksetzen
    </button>
  );
}

/** Vertikaler Trenner in der Filterleiste. */
export function FilterDivider() {
  return <div className="mx-1 hidden h-[26px] w-px bg-border sm:block" aria-hidden />;
}
