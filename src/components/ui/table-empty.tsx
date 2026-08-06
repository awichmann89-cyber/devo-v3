import { TableCell, TableRow } from "@/components/ui/table";

/**
 * Leerzeile einer Tabelle. Unterscheidet zwei Fälle, damit der Nutzer weiß, ob
 * es keine Daten gibt oder ob nur der Filter zu eng ist.
 *
 * `entity` im Plural und mit Artikel-freier Form: "Kunden", "Geräte",
 * "Positionen".
 */
export function TableEmpty({
  colSpan,
  hasData,
  entity,
  /** Überschreibt den Text für den Fall „keine Daten vorhanden". */
  emptyText,
}: {
  colSpan: number;
  /** Gibt es überhaupt Datensätze (vor Filterung)? */
  hasData: boolean;
  entity: string;
  emptyText?: string;
}) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-8 text-center text-sm text-muted-foreground">
        {hasData
          ? "Keine Treffer für die aktuellen Filter."
          : (emptyText ?? `Noch keine ${entity} angelegt.`)}
      </TableCell>
    </TableRow>
  );
}
