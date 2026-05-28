"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { deleteUser } from "./actions";
import { toast } from "sonner";
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
        toast.error("Fehler", { description: e instanceof Error ? e.message : "" });
      }
    });
  }

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon" onClick={() => setEditing(true)}>
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setConfirmOpen(true)}
        disabled={pending}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
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
    </div>
  );
}
