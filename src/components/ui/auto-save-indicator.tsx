"use client";

import { Check, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AutoSaveStatus } from "@/lib/use-auto-save";

interface Props {
  status: AutoSaveStatus;
  error?: string | null;
  className?: string;
}

export function AutoSaveIndicator({ status, error, className }: Props) {
  const base =
    "inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-opacity";
  if (status === "saving") {
    return (
      <div className={cn(base, className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Speichert …
      </div>
    );
  }
  if (status === "saved") {
    return (
      <div className={cn(base, "text-emerald-600", className)}>
        <Check className="h-3.5 w-3.5" /> Gespeichert
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className={cn(base, "text-destructive", className)}>
        <AlertTriangle className="h-3.5 w-3.5" /> {error ?? "Fehler"}
      </div>
    );
  }
  return <div className={cn(base, "opacity-0", className)}>—</div>;
}
