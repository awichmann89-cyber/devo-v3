import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import { FilterCount } from "@/components/filters/filter-controls";

/**
 * Gerüst jeder Listenseite: Titel + optionaler InfoHint, Primäraktion oben
 * rechts, darunter die Filterleiste, darunter die Tabelle.
 *
 * Regel: Die Primäraktion sitzt IMMER oben rechts im Header — nicht in der
 * Filterzeile und nicht freistehend über der Card.
 */
export function ListCard({
  title,
  info,
  action,
  secondaryAction,
  filters,
  count,
  children,
}: {
  title: string;
  /** Text für den InfoHint neben dem Titel. */
  info?: ReactNode;
  /** Primäraktion, z.B. `<CustomerDialog />`. */
  action?: ReactNode;
  /** Nebenaktion links der Primäraktion (Download, Prüfungsmodus, …). */
  secondaryAction?: ReactNode;
  /** Bausteine aus `@/components/filters/filter-controls`. */
  filters?: ReactNode;
  /** Trefferzähler rechts in der Filterleiste. */
  count?: { shown: number; total: number };
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex min-w-0 items-center gap-2">
          <span className="truncate">{title}</span>
          {info && <InfoHint text={info} />}
        </CardTitle>
        {(action || secondaryAction) && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {secondaryAction}
            {action}
          </div>
        )}
      </CardHeader>

      {filters && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
          {filters}
          {count && <FilterCount shown={count.shown} total={count.total} />}
        </div>
      )}

      <CardContent className={filters ? "px-4 pb-4" : undefined}>{children}</CardContent>
    </Card>
  );
}
