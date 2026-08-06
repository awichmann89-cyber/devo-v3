"use client";

import { useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { PackUnitForm } from "./pack-unit-form";
import type { Category, Location, PackUnit } from "@prisma/client";

interface Props {
  locations: Location[];
  categories: Category[];
  /** Gesetzt = Bearbeiten-Modus. */
  packUnit?: PackUnit;
  /** Von außen gesteuert (z.B. Stift-Button in einer Tabellenzeile). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function PackUnitDialog({
  locations,
  categories,
  packUnit,
  open: controlledOpen,
  onOpenChange,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const isEdit = !!packUnit;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isEdit && controlledOpen === undefined && (
        <DialogTrigger asChild>
          <Button>
            <Plus className="h-4 w-4" /> Packeinheit anlegen
          </Button>
        </DialogTrigger>
      )}
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Packeinheit bearbeiten" : "Packeinheit anlegen"}
          </DialogTitle>
          <DialogDescription>
            Case, Rack oder Tasche. Der Inhalt wird auf der Detailseite zugewiesen.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <PackUnitForm
            packUnit={packUnit}
            locations={locations}
            categories={categories}
            onCancel={() => setOpen(false)}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
