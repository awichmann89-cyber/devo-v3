"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteLocation } from "./actions";
import { toast } from "sonner";
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
      } catch {
        toast.error("Löschen fehlgeschlagen");
      }
    });
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Adresse</TableHead>
            <TableHead className="text-right">Packeinheiten</TableHead>
            <TableHead className="w-[100px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {locations.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                Keine Lagerorte angelegt
              </TableCell>
            </TableRow>
          )}
          {locations.map((loc) => (
            <TableRow key={loc.id}>
              <TableCell className="font-medium">{loc.name}</TableCell>
              <TableCell className="text-muted-foreground">{loc.address ?? "—"}</TableCell>
              <TableCell className="text-right">{loc._count.packUnits}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setEditing(loc)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={pending || loc._count.packUnits > 0}
                    onClick={() => setDeleting(loc)}
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
        <LocationDialog
          location={editing}
          open
          onOpenChange={(o) => !o && setEditing(null)}
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
