"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import type { Category, Location, PackUnit } from "@prisma/client";
import { PackUnitDialog } from "../pack-unit-dialog";

/**
 * „Bearbeiten"-Button im Kopf der Packeinheit-Detailseite. Der Dialog selbst
 * ist derselbe wie in der Material-Liste (`PackUnitDialog`) — hier nur der
 * Trigger, damit es keine zweite Dialog-Variante gibt.
 */
export function EditPackUnitButton({
  packUnit,
  locations,
  categories,
}: {
  packUnit: PackUnit;
  locations: Location[];
  categories: Category[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" /> Bearbeiten
      </Button>
      <PackUnitDialog
        packUnit={packUnit}
        locations={locations}
        categories={categories}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
