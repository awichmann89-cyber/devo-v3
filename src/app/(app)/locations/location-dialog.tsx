"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Loader2 } from "lucide-react";
import { createLocation, updateLocation } from "./actions";
import { toast } from "sonner";
import type { Location } from "@prisma/client";
import { splitAddress, joinAddress } from "@/lib/utils";

interface Props {
  location?: Location;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function LocationDialog({ location, open: controlledOpen, onOpenChange }: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const initialAddr = splitAddress(location?.address);
  const [name, setName] = useState(location?.name ?? "");
  const [description, setDescription] = useState(location?.description ?? "");
  const [addressStreet, setAddressStreet] = useState(initialAddr.street);
  const [addressZipCity, setAddressZipCity] = useState(initialAddr.zipCity);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      try {
        const address = joinAddress(addressStreet, addressZipCity);
        if (location) {
          await updateLocation(location.id, { name, description, address });
          toast.success("Lagerort aktualisiert");
        } else {
          await createLocation({ name, description, address });
          toast.success("Lagerort angelegt");
          setName("");
          setDescription("");
          setAddressStreet("");
          setAddressZipCity("");
        }
        setOpen(false);
      } catch (e) {
        toast.error("Fehler", { description: e instanceof Error ? e.message : String(e) });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!location && (
        <DialogTrigger asChild>
          <Button><Plus className="h-4 w-4" /> Neuer Lagerort</Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{location ? "Lagerort bearbeiten" : "Neuer Lagerort"}</DialogTitle>
          <DialogDescription>Standort für Geräte und Packeinheiten.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Adresse</Label>
            <div className="space-y-2">
              <Input
                value={addressStreet}
                onChange={(e) => setAddressStreet(e.target.value)}
                placeholder="Straße, Hausnummer"
              />
              <Input
                value={addressZipCity}
                onChange={(e) => setAddressZipCity(e.target.value)}
                placeholder="PLZ, Ort"
              />
            </div>
          </div>
         