"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Pencil,
  Trash2,
  Plus,
  X,
  Search,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  ExternalLink,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PersonDialog, PersonVM } from "./person-dialog";
import { deletePerson } from "./actions";
import { toast } from "sonner";
import { employmentTypeLabel } from "@/lib/labels";
import { formatCurrency } from "@/lib/utils";
import { EmploymentType } from "@prisma/client";

type Row = PersonVM & { _count: { assignments: number; timeEntries: number } };

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

export function PersonsTable({ persons }: { persons: Row[] }) {
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
        toast.error("Löschen nicht möglich", {
          description: e instanceof Error ? e.message : "",
        });
      }
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suche…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72 pl-8"
          />
        </div>
        {search && (
          <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
            <X className="h-4 w-4" /> Filter zurücksetzen
          </Button>
        )}
        <div className="ml-auto">
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Person anlegen
          </Button>
        </div>
      </div>

      <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:h-10 [&_th]:px-3">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Kontakt</TableHead>
            <TableHead className="text-right">Satz</TableHead>
            <TableHead className="text-right">Einsätze</TableHead>
            <TableHead className="w-[120px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                {persons.length === 0
                  ? "Noch keine Personen angelegt"
                  : "Keine Treffer für die Suche"}
              </TableCell>
            </TableRow>
          )}
          {grouped.map((group) => {
            const isCollapsed = collapsedTypes.has(group.type);
            return (
              <Fragment key={group.type}>
                <TableRow
                  className="cursor-pointer bg-muted/30 hover:bg-muted/50"
                  onClick={() => toggleType(group.type)}
                >
                  <TableCell colSpan={5} className="py-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
                      {isCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                      )}
                      {isCollapsed ? (
                        <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">{group.label}</span>
                      <span className="ml-1 font-normal text-muted-foreground normal-case">
                        ({group.items.length})
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
                {!isCollapsed &&
                  group.items.map((p) => (
                    <TableRow key={p.id} className={p.active ? "" : "opacity-50"}>
                      <TableCell style={{ paddingLeft: "2.5rem" }}>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/persons/${p.id}`}
                            className="font-medium hover:underline"
                          >
                            {p.name}
                          </Link>
                          {!p.active && <Badge variant="outline">Inaktiv</Badge>}
                        </div>
                        {p.notes && (
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {p.notes}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.email && <div>{p.email}</div>}
                        {p.phone && (
                          <div className="text-muted-foreground">{p.phone}</div>
                        )}
                        {!p.email && !p.phone && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {rateLabel(p)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {p._count.assignments}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            asChild
                            title="Detailseite"
                          >
                            <Link href={`/persons/${p.id}`}>
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(p)}
                            title="Bearbeiten"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleting(p)}
                            title="Löschen"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>

      <PersonDialog open={dialogOpen} onOpenChange={setDialogOpen} person={editing} />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Person löschen?"
        description={
          deleting && (
            <>
              {deleting._count.assignments + deleting._count.timeEntries > 0 ? (
                <>
                  <strong>{deleting.name}</strong> hat Einsätze oder erfasste
                  Arbeitszeiten und kann nicht gelöscht werden (Lohn-Historie).
                  Die Person wird stattdessen <strong>auf inaktiv gesetzt</strong>.
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
          deleting && deleting._count.assignments + deleting._count.timeEntries > 0
            ? "Deaktivieren"
            : "Löschen"
        }
        pending={pending}
        onConfirm={onConfirmDelete}
      />
    </>
  );
}
