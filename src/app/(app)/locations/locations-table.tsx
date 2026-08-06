"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmpty } from "@/components/ui/table-empty";
import { RowAction, RowActions } from "@/components/ui/row-actions";
import { Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteLocation } from "./actions";
import { toast } from "sonner";
import { isRedirectError, toastError } from "@/lib/toast";
import { LocationDialog } from "./location-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Location } from "@prisma/client";

type Row = Location & { _count: { packUnits: number } };

export function LocationsTable({ locations }: { locations: Row[] }) {
  const [editing, setEditing] = useState<Location | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [pending, startTransition] = useTransition();

  function onConfirmDelete() {
    if (!deleting) return;
    startTransition(async () => {
      try {
        await deleteLocation(deleting.id);
        toast.success("Lagerort gelöscht");
        setDeleting(null);
      } catch (err) {
        if (isRedirectError(err)) throw err;
        toastError(err, "Löschen");
      }
    });
  }

  return (
    <>
      <Table density="comfortable">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Adresse</TableHead>
            <TableHead className="text-right">Packeinheiten</TableHead>
            <TableHead className="w-[76px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {locations.length === 0 && (
            <TableEmpty colSpan={4} hasData={false} entity="Lagerorte" />
          )}
          {locations.map((loc) => (
            <TableRow key={loc.id}>
              <TableCell className="font-medium">{loc.name}</TableCell>
              <TableCell className="whitespace-pre-line text-muted-foreground">
                {loc.address ?? "—"}
              </TableCell>
              <TableCell className="num text-right">{loc._count.packUnits}</TableCell>
              <TableCell>
                <RowActions density="comfortable">
                  <RowAction icon={Pencil} label="Bearbeiten" onClick={() => setEditing(loc)} />
                  <RowAction
                    icon={Trash2}
                    label="Löschen"
                    destructive
                    disabled={pending}
                    onClick={() => setDeleting(loc)}
                  />
                </RowActions>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {editing && (
        <LocationDialog
          location={editing}
          open={!!editing}
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Lagerort löschen?"
        description={
          deleting && (
            <>
              <strong>{deleting.name}</strong> wird unwiderruflich gelöscht.
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
