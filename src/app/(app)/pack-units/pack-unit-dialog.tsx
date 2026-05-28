"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { PackUnitForm } from "./pack-unit-form";
import type { Category, Location } from "@prisma/client";

interface Props {
  locations: Location[];
  categories: Category[];
}

export function PackUnitDialog({ locations, categories }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Neue Packeinheit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Neue Packeinheit</DialogTitle>
          <DialogDescription>
            Geräte werden nach dem Anlegen auf der Detailseite zugewiesen.
          </DialogDescription>
        </DialogHeader>
        <PackUnitForm
          locations={locations}
          categories={categories}
          onCancel={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
