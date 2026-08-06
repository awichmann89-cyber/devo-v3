"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CableDialog, CableForDialog } from "../../cable-dialog";
import { deleteCable } from "../../cables-actions";
import { toastError } from "@/lib/toast";

interface CategoryOpt {
  id: string;
  name: string;
}

export function CableActionsButtons({
  cable,
  categories,
  unitsTotal,
}: {
  cable: CableForDialog;
  categories: CategoryOpt[];
  unitsTotal: number;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteCable(cable.id);
        toast.success("Kabel gelöscht");
        router.push("/material?tab=cables");
      } catch (e) {
        toastError(e, "Löschen");
      }
    });
  }

  return (
    <>
      <div className="flex gap-2 shrink-0">
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4" /> Bearbeiten
        </Button>
        <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
          <Trash2 className="h-4 w-4" /> Löschen
        </Button>
      </div>

      <CableDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        cable={cable}
        categories={categories}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Kabel löschen?"
        description={
          <>
            <strong>{cable.name}</strong> wird unwiderruflich gelöscht — inkl.{" "}
            <strong>{unitsTotal}</strong> Einzeleinheiten und deren Prüfhistorie.
          </>
        }
        confirmLabel="Löschen"
        pending={pending}
        onConfirm={handleDelete}
      />
    </>
  );
}
