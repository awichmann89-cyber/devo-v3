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
import { ProjectForm } from "./project-form";
import type { Customer } from "@prisma/client";

interface Props {
  customers: Customer[];
}

export function ProjectDialog({ customers }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Neues Projekt
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Neues Projekt</DialogTitle>
          <DialogDescription>
            Material wird nach dem Anlegen auf der Detailseite zugewiesen.
          </DialogDescription>
        </DialogHeader>
        <ProjectForm customers={customers} onCancel={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
