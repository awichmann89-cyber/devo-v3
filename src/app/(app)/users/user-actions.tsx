"use client";

import { useState, useTransition } from "react";
import { RowAction, RowActions } from "@/components/ui/row-actions";
import { Pencil, Trash2 } from "lucide-react";
import { deleteUser } from "./actions";
import { toast } from "sonner";
import { toastError } from "@/lib/toast";
import { UserDialog } from "./user-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Role } from "@prisma/client";

interface UserVM {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

export function UserActions({ user }: { user: UserVM }) {
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onConfirmDelete() {
    startTransition(async () => {
      try {
        await deleteUser(user.id);
        toast.success("Benutzer gelöscht");
        setConfirmOpen(false);
      } catch (e) {
        toastError(e, "Löschen");
      }
    });
  }

  return (
    <RowActions density="comfortable">
      <RowAction icon={Pencil} label="Bearbeiten" onClick={() => setEditing(true)} />
      <RowAction
        icon={Trash2}
        label="Löschen"
        destructive
        disabled={pending}
        onClick={() => setConfirmOpen(true)}
      />
      {editing && (
        <UserDialog user={user} open onOpenChange={(o) => !o && setEditing(false)} />
      )}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Benutzer löschen?"
        description={
          <>
            <strong>{user.email}</strong> wird unwiderruflich gelöscht. Projekte, die
            dieser Benutzer angelegt hat, bleiben bestehen (ohne Ersteller-Verknüpfung).
          </>
        }
        confirmLabel="Löschen"
        pending={pending}
        onConfirm={onConfirmDelete}
      />
    </RowActions>
  );
}
