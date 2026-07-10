"use client";

import { type ReactNode } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { QuantityInput } from "@/components/ui/quantity-input";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Heading, Pencil, Plus, Trash2 } from "lucide-react";

/**
 * Bausteine für die Zuordnungs-Tabellen im Projekt (Material, Kabel,
 * Personal & Transport) im Redesign-Stil: EINE durchgehende Tabelle,
 * Gruppen als Kopfzeilen mit Inline-Titel, Summe und Aktionen,
 * Zwischenüberschriften als inline editierbare Notiz-Zeilen.
 */

function HeaderIconButton({
  onClick,
  title,
  disabled,
  destructive,
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  destructive?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] border bg-card text-muted-foreground transition-colors disabled:opacity-35",
        destructive
          ? "hover:border-destructive hover:text-destructive"
          : "hover:border-primary hover:text-primary"
      )}
    >
      {children}
    </button>
  );
}

export interface GroupHeaderRowProps {
  group: { id: string; name: string; billable: boolean };
  /** Gesamtzahl der Tabellen-Spalten. */
  colSpan: number;
  /** Formatierte Gruppensumme (optional, z.B. Kabel haben keine Preise). */
  sumLabel?: string;
  active?: boolean;
  isFirst: boolean;
  isLast: boolean;
  pending?: boolean;
  /** Klick auf die Zeile — setzt die Gruppe als aktiv (Ziel neuer Buchungen). */
  onActivate?: () => void;
  onRename: (name: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddNote: () => void;
  /** Öffnet den Gruppen-Dialog (z.B. für das Abrechenbar-Flag). */
  onEdit?: () => void;
  onDelete: () => void;
}

/** Gruppen-Kopfzeile im Redesign: Akzentbalken, Inline-Titel, Summe, Aktionen. */
export function GroupHeaderRow({
  group,
  colSpan,
  sumLabel,
  active,
  isFirst,
  isLast,
  pending,
  onActivate,
  onRename,
  onMoveUp,
  onMoveDown,
  onAddNote,
  onEdit,
  onDelete,
}: GroupHeaderRowProps) {
  return (
    <TableRow
      className={cn(
        "border-t-2 border-t-accent bg-secondary hover:bg-secondary",
        onActivate && "cursor-pointer"
      )}
      onClick={onActivate}
    >
      <TableCell colSpan={colSpan} className="px-2.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "h-[15px] w-[3px] shrink-0 rounded-sm",
              active ? "bg-primary" : "bg-input"
            )}
            aria-hidden
          />
          {/* Inline editierbarer Gruppentitel (Enter oder Blur speichert). */}
          <input
            key={group.id + group.name}
            defaultValue={group.name}
            disabled={pending}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                (e.target as HTMLInputElement).value = group.name;
                (e.target as HTMLInputElement).blur();
              }
            }}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== group.name) onRename(v);
              else e.target.value = group.name;
            }}
            className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-xs font-bold uppercase tracking-[.04em] text-foreground outline-none focus:bg-card focus:shadow-[inset_0_0_0_1px_hsl(var(--input))]"
            aria-label="Gruppenname"
          />
          {!group.billable && (
            <Badge variant="warning" className="shrink-0">
              nicht abrechenbar
            </Badge>
          )}
          {active && (
            <Badge variant="default" className="shrink-0">
              Aktiv
            </Badge>
          )}
          {sumLabel && (
            <span className="shrink-0 pl-1 font-mono text-xs font-bold text-primary">
              {sumLabel}
            </span>
          )}
          <HeaderIconButton onClick={onMoveUp} title="Gruppe nach oben" disabled={pending || isFirst}>
            <ChevronUp className="h-3.5 w-3.5" />
          </HeaderIconButton>
          <HeaderIconButton onClick={onMoveDown} title="Gruppe nach unten" disabled={pending || isLast}>
            <ChevronDown className="h-3.5 w-3.5" />
          </HeaderIconButton>
          <HeaderIconButton onClick={onAddNote} title="Zwischenüberschrift hinzufügen" disabled={pending}>
            <Heading className="h-3.5 w-3.5" />
          </HeaderIconButton>
          {onEdit && (
            <HeaderIconButton onClick={onEdit} title="Gruppe bearbeiten" disabled={pending}>
              <Pencil className="h-3 w-3" />
            </HeaderIconButton>
          )}
          <HeaderIconButton onClick={onDelete} title="Gruppe löschen" disabled={pending} destructive>
            <Trash2 className="h-3 w-3" />
          </HeaderIconButton>
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * Zellen einer Zwischenüberschrift-Zeile (nach der Drag-Handle-Zelle einsetzen):
 * inline editierbarer Text + Entfernen-Button. `colSpan` = Spaltenzahl − 2.
 */
export function NoteRowCells({
  text,
  colSpan,
  pending,
  onSave,
  onDelete,
}: {
  text: string;
  colSpan: number;
  pending?: boolean;
  onSave: (text: string) => void;
  onDelete: () => void;
}) {
  return (
    <>
      <TableCell colSpan={colSpan} className="px-2.5 py-1">
        <div className="flex items-center gap-2">
          <Heading className="h-3 w-3 shrink-0 text-faint" aria-hidden />
          <input
            key={text}
            defaultValue={text}
            placeholder="Zwischenüberschrift…"
            disabled={pending}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== text) onSave(v);
              else e.target.value = text;
            }}
            className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-xs font-semibold italic text-muted-foreground outline-none focus:bg-card focus:not-italic focus:text-foreground focus:shadow-[inset_0_0_0_1px_hsl(var(--input))]"
            aria-label="Zwischenüberschrift"
          />
        </div>
      </TableCell>
      <TableCell className="px-2 py-1 text-right">
        <button
          type="button"
          title="Zwischenüberschrift entfernen"
          disabled={pending}
          onClick={onDelete}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-faint transition-colors hover:bg-destructive-subtle hover:text-destructive disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </TableCell>
    </>
  );
}

/** Kompakter −/+ Mengen-Stepper wie im Redesign. */
export function QtyStepper({
  value,
  onChange,
  min = 1,
  step = 1,
  allowDecimal,
  disabled,
  suffix,
  className,
  invalid,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  allowDecimal?: boolean;
  disabled?: boolean;
  /** Einheit hinter dem Wert, z.B. "h" oder "km". */
  suffix?: string;
  className?: string;
  /** Roter Rahmen bei Bestandskonflikt. */
  invalid?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center overflow-hidden rounded-md border border-input bg-card",
        invalid && "border-destructive",
        className
      )}
    >
      <button
        type="button"
        aria-label="Menge verringern"
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
        className="h-[24px] w-[23px] shrink-0 bg-secondary text-sm leading-none text-secondary-foreground transition-colors hover:bg-accent hover:text-primary disabled:opacity-35"
      >
        −
      </button>
      <QuantityInput
        min={min}
        step={step}
        allowDecimal={allowDecimal}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="h-[24px] w-11 rounded-none border-0 bg-transparent px-1 text-center font-mono text-xs font-bold shadow-none focus-visible:border-0 focus-visible:ring-0"
      />
      {suffix && (
        <span className="pr-1.5 font-mono text-[11px] text-muted-foreground">{suffix}</span>
      )}
      <button
        type="button"
        aria-label="Menge erhöhen"
        disabled={disabled}
        onClick={() => onChange(value + step)}
        className="h-[24px] w-[23px] shrink-0 bg-secondary text-sm leading-none text-secondary-foreground transition-colors hover:bg-accent hover:text-primary disabled:opacity-35"
      >
        +
      </button>
    </div>
  );
}

/** Fußzeile unter der Zuordnungs-Tabelle: „Gruppe hinzufügen" + Netto-Summe. */
export function GroupTableFooter({
  onAddGroup,
  addLabel = "Gruppe hinzufügen",
  pending,
  secondary,
  children,
}: {
  onAddGroup: () => void;
  addLabel?: string;
  pending?: boolean;
  /** Optionaler zweiter Button links (z.B. „Kabel-Gruppe hinzufügen"). */
  secondary?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-secondary px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAddGroup}
          disabled={pending}
          className="inline-flex h-[30px] items-center gap-1.5 rounded-md border border-dashed border-input bg-transparent px-3 text-xs font-semibold text-secondary-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> {addLabel}
        </button>
        {secondary}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{children}</div>
    </div>
  );
}

/** Sekundärer gestrichelter Footer-Button im selben Stil. */
export function FooterDashedButton({
  onClick,
  pending,
  children,
}: {
  onClick: () => void;
  pending?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex h-[30px] items-center gap-1.5 rounded-md border border-dashed border-input bg-transparent px-3 text-xs font-semibold text-secondary-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
    >
      <Plus className="h-3.5 w-3.5" /> {children}
    </button>
  );
}
