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
import { badgeVariants } from "@/components/ui/badge";
import { projectStatusLabel, projectStatusVariant } from "@/lib/labels";
import type { ProjectStatus } from "@prisma/client";

/**
 * Gemeinsame Bausteine der kompakten Filterleiste (Redesign).
 *
 * Diese Datei ist die EINZIGE Quelle für Suchfelder, Reset-Buttons und
 * Status-Chips. Keine eigenen Filter-Controls in Seiten bauen — sonst laufen
 * Feldbreiten, Icon-Farben und Höhen wieder auseinander.
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

/** Gemeinsame Basis aller Chip-Buttons in der Filterleiste (30px = Button `sm`). */
const CHIP_BASE =
  "inline-flex h-[30px] items-center gap-1 rounded-[5px] px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

/**
 * Chip-Tönung je Status — abgeleitet aus derselben Badge-Variante, die auch die
 * Status-Badges in den Tabellen verwenden. So kann eine Statusfarbe nicht mehr
 * zwischen Chip und Badge auseinanderlaufen.
 */
export function statusChipClass(s: ProjectStatus): string {
  return badgeVariants({ variant: projectStatusVariant(s) });
}

/** Suchfeld mit Lupe. */
export function FilterSearch({
  value,
  onChange,
  placeholder = "Suchen…",
  className,
  /** Füllt die verfügbare Breite statt der festen 210px (für schmale Panels). */
  grow,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  grow?: boolean;
}) {
  return (
    <div className={cn("relative", grow ? "min-w-[180px] flex-1" : "", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("pl-8", grow ? "w-full" : "w-[210px]")}
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
        className="w-[144px]"
      />
      <span className="text-xs text-faint">bis</span>
      <Input
        type="date"
        aria-label="Bis"
        value={to}
        onChange={(e) => onRangeChange(from, e.target.value)}
        className="w-[144px]"
      />
      <Select value="" onValueChange={(v) => onPreset(Number(v))}>
        <SelectTrigger className="w-[130px] text-xs text-muted-foreground" aria-label="Zeitraum-Vorauswahl">
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

/** Getönte Status-Chips (Mehrfachauswahl) für Projekt-Status. */
export function StatusChips({
  selected,
  onToggle,
  counts,
}: {
  selected: Set<ProjectStatus>;
  onToggle: (s: ProjectStatus) => void;
  /** Optionale Trefferzahl je Status. */
  counts?: Partial<Record<ProjectStatus, number>>;
}) {
  return (
    <FilterChips
      items={FILTER_STATUS_ORDER.map((s) => ({
        value: s,
        label: projectStatusLabel(s),
        tone: statusChipClass(s),
        count: counts?.[s],
      }))}
      selected={selected}
      onToggle={(v) => onToggle(v as ProjectStatus)}
    />
  );
}

export interface FilterChipItem {
  value: string;
  label: string;
  /** Getönte Klassen im aktiven Zustand — z.B. via `badgeVariants({variant})`. */
  tone?: string;
  count?: number;
}

/**
 * Generische Chip-Gruppe. Für Mehrfachauswahl `selected` als Set übergeben,
 * für Einfachauswahl `value`/`onChange` verwenden.
 */
export function FilterChips({
  items,
  selected,
  onToggle,
  value,
  onChange,
}: {
  items: FilterChipItem[];
  selected?: Set<string>;
  onToggle?: (value: string) => void;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const isMulti = selected !== undefined;
  return (
    <>
      {items.map((item) => {
        const active = isMulti ? selected!.has(item.value) : value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            onClick={() =>
              isMulti ? onToggle?.(item.value) : onChange?.(item.value)
            }
            title={
              isMulti
                ? active
                  ? "Filter ausblenden"
                  : "Filter einblenden"
                : undefined
            }
            className={cn(
              CHIP_BASE,
              active
                ? item.tone ?? badgeVariants({ variant: "default" })
                : "border border-dashed border-input font-medium text-muted-foreground hover:border-primary hover:text-primary"
            )}
          >
            {isMulti && active && <Check className="h-3 w-3" />}
            {item.label}
            {item.count !== undefined && (
              <span className="font-normal opacity-70">({item.count})</span>
            )}
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
      className={cn(
        CHIP_BASE,
        "px-2 font-medium text-muted-foreground hover:bg-destructive-subtle hover:text-destructive"
      )}
    >
      <X className="h-3.5 w-3.5" /> Zurücksetzen
    </button>
  );
}

/** Vertikaler Trenner in der Filterleiste. */
export function FilterDivider() {
  return <div className="mx-1 hidden h-[26px] w-px bg-border sm:block" aria-hidden />;
}

/** Trefferzähler rechts in der Filterleiste. */
export function FilterCount({ shown, total }: { shown: number; total: number }) {
  return (
    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
      {shown} von {total}
    </span>
  );
}
