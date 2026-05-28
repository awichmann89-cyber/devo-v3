"use client";

import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteDevice } from "../actions";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function DeleteDeviceButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onConfirm() {
    startTransition(async () => {
      try {
        await deleteDevice(id);
        toast.success("Gerät gelöscht");
        setOpen(false);
        router.push("/material?tab=devices");
      } catch (e) {
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
        title="Gerät löschen?"
        description={
          <>
            <strong>{name}</strong> wird unwiderruflich gelöscht. Bestehende
            Packeinheits-Verknüpfungen und Seriennummern werden ebenfalls entfernt.
          </>
        }
        confirmLabel="Löschen"
        pending={pending}
        onConfirm={onConfirm}
      />
    </>
  );
}
