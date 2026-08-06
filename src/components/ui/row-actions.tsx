"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TableDensity } from "@/components/ui/table";

/**
 * Aktions-Buttons am Zeilenende. Kapselt Größe (an die Tabellen-Dichte
 * gekoppelt), Farbe destruktiver Aktionen, `title` + `aria-label` und das
 * `stopPropagation`, das klickbare Zeilen brauchen.
 *
 * Nie einzelne Ghost-Icon-Buttons mit `h-7 w-7`/`h-8 w-8` von Hand bauen.
 */

const SIZE_BY_DENSITY: Record<TableDensity, "icon" | "iconSm" | "iconXs"> = {
  comfortable: "icon",
  compact: "iconSm",
  dense: "iconXs",
};

const DensityContext = React.createContext<TableDensity>("comfortable");

export function RowActions({
  density = "comfortable",
  className,
  children,
}: {
  density?: TableDensity;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <DensityContext.Provider value={density}>
      {/* stopPropagation, damit Aktionen in klickbaren Zeilen nicht navigieren. */}
      <div
        className={cn("flex items-center justify-end gap-1", className)}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </DensityContext.Provider>
  );
}

interface RowActionProps {
  icon: React.ComponentType<{ className?: string }>;
  /** Pflicht — wird als `title` und `aria-label` gesetzt. */
  label: string;
  onClick?: () => void;
  /** Rendert die Aktion als Link (interne Navigation). */
  href?: string;
  /** Rendert die Aktion als `<a>` (Download, externes Ziel). */
  download?: { href: string; fileName?: boolean };
  disabled?: boolean;
  destructive?: boolean;
}

export function RowAction({
  icon: Icon,
  label,
  onClick,
  href,
  download,
  disabled,
  destructive,
}: RowActionProps) {
  const density = React.useContext(DensityContext);
  const shared = {
    variant: destructive ? ("ghostDestructive" as const) : ("ghost" as const),
    size: SIZE_BY_DENSITY[density],
    title: label,
    "aria-label": label,
  };

  if (download) {
    return (
      <Button asChild {...shared}>
        <a href={download.href} download={download.fileName ? "" : undefined} rel="noopener">
          <Icon className="h-4 w-4" />
        </a>
      </Button>
    );
  }

  if (href) {
    return (
      <Button asChild {...shared}>
        <Link href={href}>
          <Icon className="h-4 w-4" />
        </Link>
      </Button>
    );
  }

  return (
    <Button {...shared} disabled={disabled} onClick={onClick}>
      <Icon className="h-4 w-4" />
    </Button>
  );
}
