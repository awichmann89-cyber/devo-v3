"use client";

import { useState, useTransition } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableEmpty } from "@/components/ui/table-empty";
import { RowAction, RowActions } from "@/components/ui/row-actions";
import { ListCard } from "@/components/layout/list-card";
import { FilterResetButton, FilterSearch } from "@/components/filters/filter-controls";
import { Pencil, Trash2, Mail, Phone } from "lucide-react";
import { CustomerDialog } from "./customer-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteCustomer } from "./actions";
import { toast } from "sonner";
import { toastBlocked } from "@/lib/toast";
import type { Customer } from "@prisma/client";

type Row = Customer & { _count: { projects: number } };

export function CustomersTable({ customers }: { customers: Row[] }) {
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();

  const filtered = customers.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const hay = `${c.name} ${c.contactPerson ?? ""} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase();
    return hay.includes(q);
  });

  function onConfirmDelete() {
    if (!deleting) return;
    startTransition(async () => {
      try {
        await deleteCustomer(deleting.id);
        toast.success("Kunde gelöscht");
        setDeleting(null);
      } catch (e) {
        toastBlocked(e, "Löschen");
      }
    });
  }

  return (
    <>
      <ListCard
        title="Kunden"
        info="Auftraggeber mit Rechnungsadresse. Kunden mit zugeordneten Projekten können nicht gelöscht werden."
        action={<CustomerDialog />}
        count={{ shown: filtered.length, total: customers.length }}
        filters={
          <>
            <FilterSearch
              value={search}
              onChange={setSearch}
              placeholder="Name, Ansprechpartner oder Kontakt…"
            />
            {search && <FilterResetButton onClick={() => setSearch("")} />}
          </>
        }
      >
        <Table density="comfortable">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Ansprechpartner</TableHead>
              <TableHead>Kontakt</TableHead>
              <TableHead>Anschrift</TableHead>
              <TableHead className="text-right">Projekte</TableHead>
              <TableHead className="w-[76px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableEmpty colSpan={6} hasData={customers.length > 0} entity="Kunden" />
            )}
            {filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-muted-foreground">{c.contactPerson ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="flex items-center gap-1 hover:underline"
                      >
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        <span className="truncate">{c.email}</span>
                      </a>
                    )}
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        className="flex items-center gap-1 hover:underline"
                      >
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        <span>{c.phone}</span>
                      </a>
                    )}
                    {!c.email && !c.phone && <span className="text-muted-foreground">—</span>}
                  </div>
                </TableCell>
                <TableCell className="whitespace-pre-line text-muted-foreground">
                  {c.address ?? "—"}
                </TableCell>
                <TableCell className="num text-right">{c._count.projects}</TableCell>
                <TableCell>
                  <RowActions density="comfortable">
                    <RowAction icon={Pencil} label="Bearbeiten" onClick={() => setEditing(c)} />
                    <RowAction
                      icon={Trash2}
                      label={
                        c._count.projects > 0
                          ? "Löschen nicht möglich — Kunde hat Projekte"
                          : "Löschen"
                      }
                      destructive
                      disabled={pending || c._count.projects > 0}
                      onClick={() => setDeleting(c)}
                    />
                  </RowActions>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ListCard>

      {editing && (
        <CustomerDialog customer={editing} open onOpenChange={(o) => !o && setEditing(null)} />
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Kunde löschen?"
        description={
          deleting && (
            <>
              <strong>{deleting.name}</strong> wird unwiderruflich gelöscht. Kunden mit
              zugeordneten Projekten können nicht gelöscht werden.
            </>
          )
        }
        confirmLabel="Löschen"
        pending={pending}
        onConfirm={onConfirmDelete}
      />
    </>
  );
}
