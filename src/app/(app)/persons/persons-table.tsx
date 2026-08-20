"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableEmpty } from "@/components/ui/table-empty";
import { TableGroupRow, groupChildIndent } from "@/components/ui/table-group-row";
import { RowAction, RowActions } from "@/components/ui/row-actions";
import { ListCard } from "@/components/layout/list-card";
import { FilterResetButton, FilterSearch } from "@/components/filters/filter-controls";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Pencil, Trash2, Plus } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PersonDialog, PersonVM, UserOptionVM } from "./person-dialog";
import { deletePerson } from "./actions";
import { toast } from "sonner";
import { toastBlocked } from "@/lib/toast";
import { employmentTypeLabel } from "@/lib/labels";
import { formatCurrency } from "@/lib/utils";
import { EmploymentType } from "@prisma/client";

type Row = PersonVM & {
  userLabel: string | null;
  /** Einsätze mit Konflikt (Überschneidung oder selber Tag, anderes Projekt). */
  conflictCount: number;
  _count: {
    assignments: number;
    timeEntries: number;
    /** Einsätze, in denen die Person als Fahrer geführt ist. */
    drivenAssignments: number;
  };
};

/** Datensätze, die ein hartes Löschen verhindern (→ nur deaktivieren). */
function blockingCount(p: Row): number {
  return (
    p._count.assignments + p._count.timeEntries + p._count.drivenAssignments
  );
}

// Reihenfolge der Beschäftigungsarten in der Anzeige
const TYPE_ORDER: EmploymentType[] = [
  EmploymentType.GESELLSCHAFTER,
  EmploymentType.MITARBEITER,
  EmploymentType.FREELANCER,
  EmploymentType.MINIJOBBER,
];

/** Satz-Anzeige je Art: Minijobber Stundenlohn, Freelancer Tagessatz. */
function rateLabel(p: PersonVM): string {
  if (p.employmentType === "MINIJOBBER" && p.hourlyWage != null) {
    return `${formatCurrency(p.hourlyWage)} / h`;
  }
  if (p.employmentType === "FREELANCER" && p.defaultDayRate != null) {
    return `${formatCurrency(p.defaultDayRate)} / Tag`;
  }
  return "—";
}

export function PersonsTable({
  persons,
  users,
}: {
  persons: Row[];
  users: UserOptionVM[];
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PersonVM | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [search, setSearch] = useState("");
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const filtered = persons.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.email ?? "").toLowerCase().includes(q) ||
      (p.phone ?? "").toLowerCase().includes(q)
    );
  });

  const grouped = TYPE_ORDER.map((type) => ({
    type,
    label: employmentTypeLabel(type),
    items: filtered.filter((p) => p.employmentType === type),
  })).filter((g) => g.items.length > 0);

  function toggleType(type: string) {
    setCollapsedTypes((prev) => {
      const s = new Set(prev);
      if (s.has(type)) s.delete(type);
      else s.add(type);
      return s;
    });
  }

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(person: PersonVM) {
    setEditing(person);
    setDialogOpen(true);
  }

  function onConfirmDelete() {
    if (!deleting) return;
    const id = deleting.id;
    startTransition(async () => {
      try {
        const res = await deletePerson(id);
        if (res.deactivated) {
          toast.info("Person hat Einsätze/Zeiten — auf inaktiv gesetzt");
        } else {
          toast.success("Person gelöscht");
        }
        setDeleting(null);
      } catch (e) {
        toastBlocked(e, "Löschen");
      }
    });
  }

  return (
    <>
      <ListCard
        title="Personen"
        info="Gesellschafter, Mitarbeiter, Freelancer und Minijobber. Personen werden im Projekt an Personal-Positionen eingeplant und erhalten einen persönlichen Link für Kalender-Abo und Zeiterfassung."
        action={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Person anlegen
          </Button>
        }
        count={{ shown: filtered.length, total: persons.length }}
        filters={
          <>
            <FilterSearch
              value={search}
              onChange={setSearch}
              placeholder="Name, E-Mail oder Telefon…"
            />
            {search && <FilterResetButton onClick={() => setSearch("")} />}
          </>
        }
      >
        <Table density="comfortable">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Kontakt</TableHead>
              <TableHead className="text-right">Satz</TableHead>
              <TableHead className="text-right">Einsätze</TableHead>
              <TableHead className="w-[76px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableEmpty colSpan={5} hasData={persons.length > 0} entity="Personen" />
            )}
            {grouped.map((group) => {
              const isCollapsed = collapsedTypes.has(group.type);
              return (
                <Fragment key={group.type}>
                  <TableGroupRow
                    colSpan={5}
                    label={group.label}
                    count={group.items.length}
                    collapsed={isCollapsed}
                    onToggle={() => toggleType(group.type)}
                  />
                  {!isCollapsed &&
                    group.items.map((p) => (
                      <TableRow
                        key={p.id}
                        className={p.active ? "cursor-pointer" : "cursor-pointer opacity-50"}
                        onClick={() => router.push(`/persons/${p.id}`)}
                      >
                        <TableCell style={{ paddingLeft: groupChildIndent(0) }}>
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/persons/${p.id}`}
                              className="font-medium hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {p.name}
                            </Link>
                            {!p.active && <Badge variant="outline">Inaktiv</Badge>}
                            {p.userLabel && (
                              <Badge variant="secondary" title="Verknüpfter Cratel-Account">
                                {p.userLabel}
                              </Badge>
                            )}
                            {p.conflictCount > 0 && (
                              <Badge
                                variant="destructive"
                                className="gap-1"
                                title="Einsätze, die sich mit einem anderen Projekt überschneiden oder am selben Tag liegen"
                              >
                                <AlertTriangle className="h-3 w-3" />
                                {p.conflictCount} Konflikt
                                {p.conflictCount === 1 ? "" : "e"}
                              </Badge>
                            )}
                          </div>
                          {p.notes && (
                            <div className="line-clamp-1 text-xs text-muted-foreground">
                              {p.notes}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {p.email && <div>{p.email}</div>}
                          {p.phone && <div className="text-muted-foreground">{p.phone}</div>}
                          {!p.email && !p.phone && (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="num text-right">{rateLabel(p)}</TableCell>
                        <TableCell className="num text-right">
                          {p._count.assignments}
                        </TableCell>
                        <TableCell>
                          <RowActions density="comfortable">
                            <RowAction
                              icon={Pencil}
                              label="Bearbeiten"
                              onClick={() => openEdit(p)}
                            />
                            <RowAction
                              icon={Trash2}
                              label="Löschen"
                              destructive
                              disabled={pending}
                              onClick={() => setDeleting(p)}
                            />
                          </RowActions>
                        </TableCell>
                      </TableRow>
                    ))}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </ListCard>

      <PersonDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        person={editing}
        users={users}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Person löschen?"
        description={
          deleting && (
            <>
              {blockingCount(deleting) > 0 ? (
                <>
                  <strong>{deleting.name}</strong> hat Einsätze, erfasste
                  Arbeitszeiten oder Fahrer-Einträge und kann nicht gelöscht
                  werden (Lohn- und Dispositions-Historie). Die Person wird
                  stattdessen <strong>auf inaktiv gesetzt</strong>.
                </>
              ) : (
                <>
                  <strong>{deleting.name}</strong> wird unwiderruflich gelöscht.
                </>
              )}
            </>
          )
        }
        confirmLabel={
          deleting && blockingCount(deleting) > 0 ? "Deaktivieren" : "Löschen"
        }
        pending={pending}
        onConfirm={onConfirmDelete}
      />
    </>
  );
}
