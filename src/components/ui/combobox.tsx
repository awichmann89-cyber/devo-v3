"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Optionaler Hilfstext, der unter dem Label angezeigt wird */
  hint?: string;
}

interface Props {
  value: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  /** Text, der im Trigger angezeigt wird, wenn `value` leer ist */
  emptyLabel?: string;
  /** Erlaubt das Zurücksetzen auf den leeren Wert */
  clearable?: boolean;
  disabled?: boolean;
  /** Optionale CSS-Klasse für den Trigger-Button */
  className?: string;
  id?: string;
  /**
   * Setzt den Fokus beim Mounten auf den Trigger — für das erste Feld eines
   * Dialogs (docs/ui-conventions.md §9). Tastatur-Nutzer können direkt mit
   * Enter/Leertaste öffnen und lostippen.
   */
  autoFocus?: boolean;
}

/**
 * Schlankes Autocomplete-Eingabefeld auf Basis von Popover + Input + Liste.
 * Sucht case-insensitiv in `label` und `hint`.
 */
export function Combobox({
  value,
  onValueChange,
  options,
  placeholder = "Suche…",
  emptyLabel = "— bitte wählen —",
  clearable = false,
  disabled,
  className,
  id,
  autoFocus,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const reactId = useId();
  const triggerId = id ?? reactId;

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.hint ?? "").toLowerCase().includes(q)
    );
  }, [options, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setQuery("");
          // kurz warten, damit das Popover gerendert wird, dann fokussieren
          setTimeout(() => inputRef.current?.focus(), 0);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={triggerId}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          autoFocus={autoFocus}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">
            {selected ? selected.label : emptyLabel}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {clearable && selected && (
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onValueChange("");
                }}
                className="rounded p-0.5 opacity-50 hover:bg-muted hover:opacity-100"
                title="Auswahl zurücksetzen"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <div className="border-b p-2">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            size="sm"
          />
        </div>
        <ul
          className="max-h-64 overflow-y-auto py-1"
          role="listbox"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-center text-xs text-muted-foreground">
              Keine Treffer
            </li>
          ) : (
            filtered.map((o) => {
              const isSelected = o.value === value;
              return (
                <li key={o.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => {
                      onValueChange(o.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                      isSelected && "bg-accent/50"
                    )}
                  >
                    <Check
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        isSelected ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{o.label}</span>
                      {o.hint && (
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {o.hint}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
