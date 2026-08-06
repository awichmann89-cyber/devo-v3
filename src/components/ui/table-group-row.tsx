"use client";

import { ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";

/**
 * Einrückung pro Hierarchie-Ebene in rem. Gilt für Gruppen-Kopfzeilen UND die
 * darunterliegenden Datenzeilen — deshalb hier zentral, nicht pro Tabelle.
 */
export const GROUP_INDENT_REM = 1.5;

/** Linkes Padding einer Datenzeile unterhalb einer Gruppe der Tiefe `depth`. */
export function groupChildIndent(depth: number): string {
  return `${1 + (depth + 1) * GROUP_INDENT_REM}rem`;
}

/**
 * Aufklappbare Gruppen-Kopfzeile in Listen-Tabellen (Kategorien, Arten,
 * Beschäftigungsformen). Ersetzt die fünf zuvor kopierten Varianten in
 * devices-/pack-units-/cables-section, services- und persons-table.
 */
export function TableGroupRow({
  colSpan,
  label,
  count,
  collapsed,
  onToggle,
  depth = 0,
}: {
  colSpan: number;
  label: string;
  /** Anzahl der Einträge; bei 0 wird die Zahl ausgelassen. */
  count?: number;
  collapsed: boolean;
  onToggle: () => void;
  depth?: number;
}) {
  return (
    <TableRow className="cursor-pointer bg-secondary/60 hover:bg-accent" onClick={onToggle}>
      <TableCell colSpan={colSpan}>
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          style={{ paddingLeft: `${depth * GROUP_INDENT_REM}rem` }}
          className="flex w-full items-center gap-1.5 text-left text-xs font-semibold uppercase tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          )}
          {collapsed ? (
            <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{label}</span>
          {count !== undefined && count > 0 && (
            <span className="ml-1 font-normal normal-case text-muted-foreground">({count})</span>
          )}
        </button>
      </TableCell>
    </TableRow>
  );
}
