"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * KPI-Kachel. Eine Implementierung für Dashboard, Rechnungs-Summen, Forecast und
 * die Projekt-Kopfzahlen — vorher waren das vier verschiedene Kacheln mit drei
 * Wertgrößen.
 *
 * Der Akzentbalken links ist Standard; `tone` färbt ihn und (bei den
 * Signal-Tönen) den Wert.
 */

type Tone = "default" | "muted" | "success" | "warning" | "destructive" | "info";

const ACCENT: Record<Tone, string> = {
  default: "bg-primary",
  muted: "bg-faint",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  info: "bg-info",
};

const VALUE_TONE: Record<Tone, string> = {
  default: "text-foreground",
  muted: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  info: "text-info",
};

export interface StatTileProps {
  label: string;
  /** Bereits formatierter Wert (`formatCurrency(…)`, Anzahl, „12,5 kg", …). */
  value: string | number;
  /** Zweite Zeile unter dem Wert. */
  hint?: React.ReactNode;
  tone?: Tone;
  icon?: React.ComponentType<{ className?: string }>;
  /** Macht die Kachel zum Link. */
  href?: string;
  /** Macht die Kachel zum Filter-Button. */
  onClick?: () => void;
  /** Hebt die Kachel als aktiven Filter hervor (nur mit `onClick`). */
  active?: boolean;
  /**
   * Kleinere Wertgröße für mehrzeilige Textwerte (z.B. Datumsbereiche), die als
   * große Zahl nicht funktionieren.
   */
  size?: "default" | "sm";
}

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  icon: Icon,
  href,
  onClick,
  active,
  size = "default",
}: StatTileProps) {
  const interactive = !!href || !!onClick;
  const inner = (
    <>
      <span className={cn("absolute left-0 top-0 h-full w-[3px] opacity-85", ACCENT[tone])} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        {Icon && <Icon className={cn("h-4 w-4 shrink-0", VALUE_TONE[tone])} />}
      </div>
      <div
        className={cn(
          "mt-1 num font-extrabold leading-none tracking-tight",
          size === "sm" ? "text-sm leading-snug" : "text-2xl",
          VALUE_TONE[tone]
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </>
  );

  const className = cn(
    "relative overflow-hidden rounded-lg border bg-card px-4 py-3 text-left",
    interactive && "transition-colors hover:border-primary",
    active && "border-primary ring-1 ring-primary"
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className={className}>
        {inner}
      </button>
    );
  }
  return <div className={className}>{inner}</div>;
}

/** Responsives Raster für Kachelreihen. */
export function StatTileGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>{children}</div>
  );
}
