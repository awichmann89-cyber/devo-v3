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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, X, Mail, Phone } from "lucide-react";
import { CustomerDialog } from "./customer-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteCustomer } from "./actions";
import { toast } from "sonner";
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
        toast.error("Löschen nicht möglich", {
          description: e instanceof Error ? e.message : "",
        });
      }
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Suche..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        {search && (
          <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
            <X className="h-4 w-4" /> Filter zurücksetzen
          </Button>
        )}
        <div className="ml-auto">
          <CustomerDialog />
        </div>
      </div>

      <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:h-10 [&_th]:px-3">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Ansprechpartner</TableHead>
            <TableHead>Kontakt</TableHead>
            <TableHead>Anschrift</TableHead>
            <TableHead className="text-right">Projekte</TableHead>
            <TableHead className="w-[90px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                {customers.length === 0
                  ? "Noch keine Kunden angelegt"
                  : "Keine Treffer für die Suche"}
              </TableCell>
            </TableRow>
          )}
          {filtered.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell className="text-muted-foreground">{c.contactPerson ?? "—"}</TableCell>
              <TableCell className="text-sm">
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
                  {!c.email && !c.phone && (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm whitespace-pre-line">
                {c.address ?? "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">{c._count.projects}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Bearbeiten"
                    onClick={() => setEditing(c)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Löschen"
                    disabled={pending || c._count.projects > 0}
                    onClick={() => setDeleting(c)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {editing && (
        <CustomerDialog
          customer={editing}
          open
          onOpenChange={(o) => !o && setEditing(null)}
        />
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
