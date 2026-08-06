import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Kopfbereich jeder Detailseite: „Zurück"-Zeile, dann Titel mit Badges und
 * Aktionen rechts. Ersetzt die zuvor zwei unterschiedlichen Muster (Titel mal
 * als `h1 text-[21px] font-extrabold`, mal als `h2 text-lg font-bold`).
 */
export function DetailHeader({
  backHref,
  backLabel = "Zurück",
  title,
  badges,
  subtitle,
  actions,
}: {
  backHref: string;
  backLabel?: string;
  title: string;
  /** Status-Badges rechts neben dem Titel. */
  badges?: ReactNode;
  /** Zweite Zeile: Kunde, Hersteller/Modell, Kabel-Spec, … */
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" /> {backLabel}
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h1 className="text-[21px] font-extrabold tracking-tight">{title}</h1>
            {badges}
          </div>
          {subtitle && (
            <div className="text-sm text-muted-foreground">{subtitle}</div>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2 sm:shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
