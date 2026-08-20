"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { VehicleDialog, VehicleVM } from "../vehicle-dialog";

/** Bearbeiten-Button + Dialog für die Fuhrpark-Detailseite. */
export function VehicleEditButton({ vehicle }: { vehicle: VehicleVM }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" /> Bearbeiten
      </Button>
      <VehicleDialog open={open} onOpenChange={setOpen} vehicle={vehicle} />
    </>
  );
}
