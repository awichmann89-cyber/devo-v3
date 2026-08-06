import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Leerzustand einer Fläche (nicht einer Tabellenzeile — dafür `TableEmpty`).
 * Icon + Satz + optionale Erstaktion, damit der Nutzer weiß, was als Nächstes
 * zu tun ist.
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  /** Ohne umgebende Card rendern (wenn die Fläche schon in einer Card liegt). */
  bare,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  bare?: boolean;
}) {
  const body = (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      {Icon && <Icon className="h-8 w-8 text-muted-foreground opacity-40" />}
      <p className="text-sm text-muted-foreground">{title}</p>
      {hint && <p className="max-w-md text-xs text-muted-foreground">{hint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );

  if (bare) return body;
  return (
    <Card>
      <CardContent className="p-0">{body}</CardContent>
    </Card>
  );
}
