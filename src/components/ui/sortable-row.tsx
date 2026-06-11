"use client";

import { forwardRef, ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TableRow } from "@/components/ui/table";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props extends React.HTMLAttributes<HTMLTableRowElement> {
  /** Eindeutige ID innerhalb der SortableContext-Gruppe — z.B. "DEVICE:abc123" */
  id: string;
  children: ReactNode;
}

/**
 * Tabellen-Row mit Drag&Drop-Support. Wickelt `<TableRow>` mit dnd-kit's
 * `useSortable`. Die Children werden unverändert gerendert — der eigentliche
 * Drag-Handle ist eine separate `<DragHandleCell>` Komponente, die irgendwo
 * im Row platziert werden muss.
 */
export const SortableRow = forwardRef<HTMLTableRowElement, Props>(
  function SortableRow({ id, children, className, ...rest }, _ref) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id });

    const style: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <TableRow
        ref={setNodeRef}
        style={style}
        className={cn(isDragging && "relative z-10", className)}
        data-sortable-id={id}
        data-drag-attributes={JSON.stringify(attributes)}
        // listeners + attributes über CSS-Variable-Hack auf Drag-Handle
        // werden via React Context bereitgestellt
        {...rest}
      >
        <SortableHandleContext.Provider value={{ listeners, attributes }}>
          {children}
        </SortableHandleContext.Provider>
      </TableRow>
    );
  }
);

import { createContext, useContext } from "react";

type HandleCtx = {
  listeners: ReturnType<typeof useSortable>["listeners"];
  attributes: ReturnType<typeof useSortable>["attributes"];
};

const SortableHandleContext = createContext<HandleCtx | null>(null);

/**
 * Drag-Handle-Cell — muss innerhalb einer `<SortableRow>` platziert werden.
 * Stellt das Grip-Icon und nimmt die Drag-Listener entgegen.
 */
export function DragHandleCell({ className }: { className?: string }) {
  const ctx = useContext(SortableHandleContext);
  return (
    <td
      className={cn(
        "w-6 cursor-grab touch-none select-none text-muted-foreground active:cursor-grabbing",
        className
      )}
      {...(ctx?.attributes ?? {})}
      {...(ctx?.listeners ?? {})}
    >
      <GripVertical className="h-4 w-4 mx-auto" />
    </td>
  );
}
