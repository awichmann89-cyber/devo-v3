"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import type { Category, Location, PackUnit } from "@prisma/client";
import { PackUnitForm } from "../pack-unit-form";

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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4" /> Bearbeiten
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Packeinheit bearbeiten</DialogTitle>
        </DialogHeader>
        <PackUnitForm
          packUnit={packUnit}
          locations={locations}
          categories={categories}
          onCancel={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
