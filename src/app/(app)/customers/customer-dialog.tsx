"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Loader2 } from "lucide-react";
import { createCustomer, updateCustomer } from "./actions";
import { toast } from "sonner";
import type { Customer } from "@prisma/client";
import { splitAddress, joinAddress } from "@/lib/utils";

interface Props {
  customer?: Customer;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Bei Create: wird mit der neuen Customer-Info aufgerufen */
  onCreated?: (customer: { id: string; name: string; address: string | null }) => void;
}

export function CustomerDialog({
  customer,
  open: controlledOpen,
  onOpenChange,
  onCreated,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const isEdit = !!customer;

  const initialAddr = splitAddress(customer?.address);
  const [form, setForm] = useState({
    name: customer?.name ?? "",
    contactPerson: customer?.contactPerson ?? "",
    email: customer?.email ?? "",
    phone: customer?.phone ?? "",
    addressStreet: initialAddr.street,
    addressZipCity: initialAddr.zipCity,
    notes: customer?.notes ?? "",
  });
  const [pending, startTransition] = useTransition();

  // Beim Öffnen des Dialogs Form neu initialisieren — bei Create wird er geleert,
  // bei Edit zeigt er die aktuellen Werte des übergebenen Customers.
  useEffect(() => {
    if (open) {
      const a = splitAddress(customer?.address);
      setForm({
        name: customer?.name ?? "",
        contactPerson: customer?.contactPerson ?? "",
        email: customer?.email ?? "",
        phone: customer?.phone ?? "",
        addressStreet: a.street,
        addressZipCity: a.zipCity,
        notes: customer?.notes ?? "",
      });
    }
  }, [open, customer]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Wichtig: stop propagation, sonst bubbelt das Submit-Event über die
    // React-Portal-Hierarchie ins ggf. äußere Projekt-Form und legt das Projekt
    // versehentlich mit an.
    e.stopPropagation();
    startTransition(async () => {
      try {
        const payload = {
          name: form.name,
          contactPerson: form.contactPerson,
          email: form.email,
          phone: form.phone,
          address: joinAddress(form.addressStreet, form.addressZipCity),
          notes: form.notes,
        };
        if (customer) {
          await updateCustomer(customer.id, payload);
          toast.success("Kunde aktualisiert");
        } else {
          const created = await createCustomer(payload);
          toast.success("Kunde angelegt");
          onCreated?.(created);
        }
        setOpen(false);
      } catch (e) {
        toast.error("Fehler", { description: e instanceof Error ? e.message : "" });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!customer && controlledOpen === undefined && (
        <DialogTrigger asChild>
          <Button>
            <Plus className="h-4 w-4" /> Kunde anlegen
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Kunde bearbeiten" : "Kunde anlegen"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Firmenname / Kundenname</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact">Ansprechpartner</Label>
            <Input
              id="contact"
              value={form.contactPerson ?? ""}
              onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email ?? ""}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefon</Label>
              <Input
                id="phone"
                value={form.phone ?? ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Anschrift</Label>
            <div className="space-y-2">
              <Input
                value={form.addressStreet}
                onChange={(e) => setForm({ ...form, addressStreet: e.target.value })}
                placeholder="Straße, Hausnummer"
              />
              <Input
                value={form.addressZipCity}
                onChange={(e) => setForm({ ...form, addressZipCity: e.target.value })}
                placeholder="PLZ, Ort"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notizen (intern)</Label>
            <Textarea
              id="notes"
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Speichern" : "Anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
