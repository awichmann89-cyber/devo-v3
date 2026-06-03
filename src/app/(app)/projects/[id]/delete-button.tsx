"use client";

import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteProject } from "../actions";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function DeleteProjectButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      try {
        await deleteProject(id);
      } catch (e) {
        if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
        toast.error("Löschen fehlgeschlagen", { description: e instanceof Error ? e.message : "" });
      }
    });
  }

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" /> Löschen
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Projekt löschen?"
        description={
          <>
            <strong>{name}</strong> wird unwiderruflich gelöscht inklusive aller
            zugewiesenen Packeinheiten in diesem Projekt.
          </>
        }
        confirmLabel="Löschen"
        pending={pending}
        onConfirm={onConfirm}
      />
    </>
  );
}
