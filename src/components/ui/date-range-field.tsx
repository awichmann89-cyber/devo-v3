"use client";

import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { de } from "date-fns/locale";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  DEFAULT_PLAN_END_TIME,
  DEFAULT_PLAN_START_TIME,
  addDays,
  dayDiff,
  startOfDay,
  timeOf,
  withTime,
} from "@/lib/period-planning";

const fmt = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// Planungszeiten sind halbstündig genau — auf Minuten kommt es nicht an.
const HALF_HOURS = Array.from({ length: 48 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`
);

/**
 * Halbstunden-Auswahl. Ein gespeicherter Wert dazwischen (Altdaten) bleibt
 * wählbar, damit er nicht stillschweigend gerundet wird.
 */
function TimeSelect({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const options = HALF_HOURS.includes(value)
    ? HALF_HOURS
    : [...HALF_HOURS, value].sort();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-60">
        {options.map((t) => (
          <SelectItem key={t} value={t}>
            {t} Uhr
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Zeitraum mit zwei Klicks in einem Kalender: erster Klick Start-, zweiter
 * Klick End-Tag. Ein Klick vor den Start setzt den Start neu. Uhrzeiten stehen
 * darunter und sind vorbelegt, damit man sie meist nicht anfassen muss.
 */
export function DateRangeField({
  id,
  start,
  end,
  onChange,
  placeholder = "Zeitraum wählen…",
}: {
  id?: string;
  start: Date | null;
  end: Date | null;
  onChange: (start: Date, end: Date) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  // Entwurf während der Auswahl: nach dem ersten Klick steht nur `from`.
  const [from, setFrom] = useState<Date | null>(null);
  const [hover, setHover] = useState<Date | null>(null);
  // Uhrzeiten kommen aus dem gesetzten Zeitraum; ohne Zeitraum gelten die
  // Vorgaben (bzw. was der Benutzer vorab eingestellt hat).
  const [draftStartTime, setDraftStartTime] = useState(DEFAULT_PLAN_START_TIME);
  const [draftEndTime, setDraftEndTime] = useState(DEFAULT_PLAN_END_TIME);
  const startTime = start ? timeOf(start) : draftStartTime;
  const endTime = end ? timeOf(end) : draftEndTime;

  const selFrom = from ?? (start ? startOfDay(start) : null);
  const selTo = from ? (hover && dayDiff(from, hover) >= 0 ? hover : null) : end ? startOfDay(end) : null;

  function commit(a: Date, b: Date, st = startTime, et = endTime) {
    let s = withTime(a, st);
    let e = withTime(b, et);
    // Gleicher Tag und Ende vor Start: Ende ans Tagesende schieben statt
    // einen ungültigen Zeitraum zu speichern.
    if (e <= s) e = withTime(b, "23:30");
    if (e <= s) s = withTime(a, "00:00");
    onChange(s, e);
  }

  function onDayClick(day: Date) {
    if (!from || dayDiff(from, day) < 0) {
      setFrom(day);
      return;
    }
    commit(from, day);
    setFrom(null);
    setHover(null);
    setOpen(false);
  }

  function onTimeChange(which: "start" | "end", v: string) {
    if (which === "start") setDraftStartTime(v);
    else setDraftEndTime(v);
    if (start && end && v) {
      commit(
        startOfDay(start),
        startOfDay(end),
        which === "start" ? v : startTime,
        which === "end" ? v : endTime
      );
    }
  }

  const days = start && end ? dayDiff(start, end) + 1 : 0;
  const today = new Date();

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setFrom(null);
          setHover(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn("w-full justify-start font-normal", !start && "text-muted-foreground")}
        >
          <CalendarRange className="h-4 w-4" />
          {start && end ? (
            <span className="truncate">
              {fmt.format(start)} {timeOf(start)} – {fmt.format(end)} {timeOf(end)}
              <span className="ml-2 text-muted-foreground">
                ({days} {days === 1 ? "Tag" : "Tage"})
              </span>
            </span>
          ) : (
            placeholder
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <p className="mb-2 text-xs text-muted-foreground">
          {from ? "Ende wählen" : "Start wählen"}
        </p>
        <DayPicker
          locale={de}
          numberOfMonths={2}
          captionLayout="dropdown"
          startMonth={new Date(today.getFullYear() - 2, 0)}
          endMonth={new Date(today.getFullYear() + 5, 11)}
          defaultMonth={start ?? today}
          onDayClick={onDayClick}
          onDayMouseEnter={(d) => from && setHover(d)}
          modifiers={{
            rangeStart: selFrom ? [selFrom] : [],
            rangeEnd: selTo ? [selTo] : [],
            rangeMiddle:
              selFrom && selTo && dayDiff(selFrom, selTo) > 1
                ? { from: addDays(selFrom, 1), to: addDays(selTo, -1) }
                : [],
          }}
          modifiersClassNames={{
            rangeStart:
              "bg-primary-subtle rounded-l-md [&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
            rangeEnd:
              "bg-primary-subtle rounded-r-md [&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
            rangeMiddle: "bg-primary-subtle [&>button]:rounded-none",
          }}
          components={{
            Chevron: ({ orientation }) =>
              orientation === "left" ? (
                <ChevronLeft className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              ),
          }}
          classNames={{
            root: "relative",
            months: "flex flex-col gap-4 sm:flex-row",
            month: "space-y-2",
            month_caption: "flex h-8 items-center justify-center px-8",
            caption_label: "flex items-center gap-1 text-sm font-medium [&>svg]:hidden",
            dropdowns: "flex items-center gap-1",
            dropdown_root:
              "relative rounded-md border px-2 py-0.5 hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
            dropdown: "absolute inset-0 cursor-pointer opacity-0",
            nav: "absolute inset-x-0 top-0 z-10 flex h-8 items-center justify-between",
            button_previous:
              "inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent disabled:opacity-30",
            button_next:
              "inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent disabled:opacity-30",
            month_grid: "border-collapse",
            weekdays: "flex",
            weekday: "w-9 text-[11px] font-normal text-muted-foreground",
            week: "mt-0.5 flex",
            day: "h-9 w-9 p-0 text-center text-sm",
            day_button:
              "h-9 w-9 rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            today: "font-semibold text-primary",
            outside: "invisible",
          }}
        />
        <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3">
          <div className="space-y-1">
            <Label htmlFor={id ? `${id}-start-time` : undefined} className="text-xs">
              Start-Uhrzeit
            </Label>
            <TimeSelect
              id={id ? `${id}-start-time` : undefined}
              value={startTime}
              onChange={(v) => onTimeChange("start", v)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={id ? `${id}-end-time` : undefined} className="text-xs">
              End-Uhrzeit
            </Label>
            <TimeSelect
              id={id ? `${id}-end-time` : undefined}
              value={endTime}
              onChange={(v) => onTimeChange("end", v)}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
