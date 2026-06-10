"use client";

import { forwardRef, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "min" | "max" | "step"
> & {
  /** Aktueller Zahlenwert. */
  value: number;
  /** Wird gefeuert, sobald der Buffer eine gültige Zahl enthält. Bei leerem Buffer NICHT gefeuert. */
  onChange: (value: number) => void;
  /** Untere Schranke (default 1). Werte darunter werden onBlur gesnapped. */
  min?: number;
  /** Obere Schranke (optional). */
  max?: number;
  /** Schrittweite (default 1). */
  step?: number;
  /** Erlaubt Dezimalzahlen (default false). */
  allowDecimal?: boolean;
};

/**
 * Zahlen-Input, der das kurzzeitige Leeren des Feldes erlaubt — der Parent
 * sieht KEINE Zwischenstände (kein 0, kein NaN). Erst wenn der Buffer wieder
 * eine gültige Zahl enthält, wird onChange gefeuert. Beim Verlieren des Fokus
 * mit leerem oder ungültigem Inhalt wird auf den letzten validen Wert
 * zurückgesetzt und min/max wird durchgesetzt.
 */
export const QuantityInput = forwardRef<HTMLInputElement, Props>(function QuantityInput(
  {
    value,
    onChange,
    min = 1,
    max,
    step = 1,
    allowDecimal = false,
    className,
    onBlur,
    onFocus,
    ...rest
  },
  ref
) {
  const [text, setText] = useState<string>(formatValue(value));
  const [focused, setFocused] = useState(false);

  // Wenn der externe Wert sich ändert, übernehmen wir ihn nur,
  // solange der Nutzer nicht gerade tippt.
  useEffect(() => {
    if (!focused) setText(formatValue(value));
  }, [value, focused]);

  function tryParse(t: string): number | null {
    if (t === "" || t === "-") return null;
    const n = allowDecimal ? Number(t) : parseInt(t, 10);
    if (!Number.isFinite(n)) return null;
    return n;
  }

  return (
    <Input
      {...rest}
      ref={ref}
      type="number"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      min={min}
      max={max}
      step={step}
      value={text}
      className={cn(className)}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const parsed = tryParse(t);
        if (parsed === null) return; // Leer/ungültig → kein Callback
        // Nur committen, wenn im erlaubten Bereich liegt — damit der Nutzer
        // ungestört „weiter tippen" kann (z.B. 1 → 12, kein Snap zwischendurch).
        if (parsed < min) return;
        if (max !== undefined && parsed > max) return;
        if (parsed === value) return;
        onChange(parsed);
      }}
      onBlur={(e) => {
        setFocused(false);
        const parsed = tryParse(text);
        if (parsed === null || parsed < min) {
          // Buffer leer/zu klein → auf letzten validen Wert oder min snappen.
          const fallback = value >= min ? value : min;
          setText(formatValue(fallback));
          if (fallback !== value) onChange(fallback);
        } else if (max !== undefined && parsed > max) {
          setText(formatValue(max));
          onChange(max);
        } else {
          // Buffer normalisieren (z.B. „01" → „1")
          setText(formatValue(parsed));
        }
        onBlur?.(e);
      }}
    />
  );
});

function formatValue(n: number): string {
  if (!Number.isFinite(n)) return "";
  return String(n);
}
