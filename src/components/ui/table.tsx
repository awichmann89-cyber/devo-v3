import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Tabellen-Dichte. Regel:
 *   comfortable → Stammdaten-Listen (Kunden, Geräte, Personen, …)
 *   compact     → Finanz- und Zeitlisten (Rechnungen, Angebote, Forecast)
 *   dense       → Zuordnungstabellen im Projekt (Material, Personal, Kosten)
 *
 * Immer über die Prop setzen, nie per `[&_td]:…`-className — sonst laufen die
 * Stufen wieder auseinander.
 */
const DENSITIES = {
  comfortable: "[&_td]:px-3 [&_td]:py-2 [&_th]:h-10 [&_th]:px-3",
  compact: "[&_td]:px-3 [&_td]:py-1.5 [&_th]:h-9 [&_th]:px-3",
  dense: "[&_td]:px-2 [&_td]:py-1 [&_th]:h-8 [&_th]:px-2",
} as const;

export type TableDensity = keyof typeof DENSITIES;

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  density?: TableDensity;
  /**
   * Umrahmt die Tabelle mit `rounded-lg border` und clippt die Ecken — das
   * Redesign-Muster für Tabellen in Cards. Standard: an.
   */
  bordered?: boolean;
  /**
   * Hält die Spaltenköpfe beim Scrollen sichtbar. Für jede Tabelle, die in
   * einem höhenbegrenzten Container scrollt (Zuordnungstabellen im Projekt) —
   * sonst weiß man nach zehn Zeilen nicht mehr, welche Spalte welche ist.
   * `bg-secondary` sitzt schon auf `TableHead`, deshalb reicht sticky + z-Index.
   */
  stickyHeader?: boolean;
  /** Klassen für den scrollenden Wrapper (z.B. `max-h-…`). */
  wrapperClassName?: string;
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  (
    {
      className,
      density = "comfortable",
      bordered = true,
      stickyHeader,
      wrapperClassName,
      ...props
    },
    ref
  ) => (
    <div
      className={cn(
        "relative w-full overflow-auto",
        bordered && "rounded-lg border",
        wrapperClassName
      )}
    >
      <table
        ref={ref}
        className={cn(
          "w-full caption-bottom text-[13px]",
          DENSITIES[density],
          // Die Trennlinie muss auf den Zellen sitzen, nicht auf der Zeile:
          // ein `border-b` am <tr> wandert beim Scrollen nicht mit den
          // sticky-Zellen mit und verschwindet.
          stickyHeader &&
            "[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-20 [&_thead_th]:shadow-[inset_0_-1px_0_hsl(var(--border))]",
          className
        )}
        {...props}
      />
    </div>
  )
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  )
);
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot
      ref={ref}
      className={cn("border-t bg-secondary font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  )
);
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        // Hover nur auf Body-Zeilen — Kopfzeilen sollen nicht reagieren.
        "border-b transition-colors data-[state=selected]:bg-accent [tbody_&]:hover:bg-secondary",
        className
      )}
      {...props}
    />
  )
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        // Redesign: kompakte Kopfzeile — 10px Uppercase auf surface-2
        "bg-secondary text-left align-middle text-[10px] font-bold uppercase tracking-[.05em] text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn("align-middle [&:has([role=checkbox])]:pr-0", className)} {...props} />
  )
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
  )
);
TableCaption.displayName = "TableCaption";

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
