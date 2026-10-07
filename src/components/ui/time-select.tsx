"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Planungszeiten sind halbstündig genau — auf Minuten kommt es nicht an.
const HALF_HOURS = Array.from(
  { length: 48 },
  (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`
);

const ALL_DAY = "allday";

/**
 * Uhrzeit-Auswahl in halbstündigen Schritten. Ein gespeicherter Wert
 * dazwischen (Altdaten) bleibt wählbar, damit er nicht stillschweigend
 * gerundet wird. Mit `allDayLabel` gibt es zusätzlich „ganztägig" (Wert null).
 */
export function TimeSelect({
  id,
  value,
  onChange,
  allDayLabel,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string | null;
  onChange: (v: string | null) => void;
  allDayLabel?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const options =
    value === null || HALF_HOURS.includes(value) ? HALF_HOURS : [...HALF_HOURS, value].sort();
  return (
    <Select
      value={value ?? ALL_DAY}
      onValueChange={(v) => onChange(v === ALL_DAY ? null : v)}
    >
      <SelectTrigger id={id} className={cn(className)} aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-60">
        {allDayLabel && <SelectItem value={ALL_DAY}>{allDayLabel}</SelectItem>}
        {options.map((t) => (
          <SelectItem key={t} value={t}>
            {t} Uhr
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
