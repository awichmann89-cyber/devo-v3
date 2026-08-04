"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { PersonDialog, PersonVM, UserOptionVM } from "../person-dialog";

/** Bearbeiten-Button + Dialog für die Personen-Detailseite. */
export function PersonEditButton({
  person,
  users,
}: {
  person: PersonVM;
  users: UserOptionVM[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" /> Bearbeiten
      </Button>
      <PersonDialog open={open} onOpenChange={setOpen} person={person} users={users} />
    </>
  );
}
