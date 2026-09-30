"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
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
import { Plus, Loader2, Trash2 } from "lucide-react";
import { createCustomer, updateCustomer } from "./actions";
import { toast } from "sonner";
import type { Customer } from "@prisma/client";
import { splitAddress, joinAddress } from "@/lib/utils";
import { toastError } from "@/lib/toast";

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
    nameLines: customer?.nameLines ?? [],
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
        nameLines: customer?.nameLines ?? [],
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
          nameLines: form.nameLines,
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
        toastError(e, "Speichern");
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
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Kunde bearbeiten" : "Kunde anlegen"}</DialogTitle>
          <DialogDescription>
            Auftraggeber mit Rechnungsadresse. Die Anschrift erscheint auf Angeboten
            und Rechnungen.
          </DialogDescription>
        </DialogHeader>
        {/* DialogBody scrollt, damit „Anlegen" bei vielen Namenszeilen sichtbar bleibt. */}
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
          <DialogBody className="space-y-4">
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
              <Label>Zweite Namenszeile (Auswahl)</Label>
              <p className="text-xs text-muted-foreground">
                Z.B. Abteilung oder „c/o …". Welche Zeile gedruckt wird, wählst du im
                Projekt.
              </p>
              {form.nameLines.map((line, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={line}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        nameLines: form.nameLines.map((l, idx) =>
                          idx === i ? e.target.value : l
                        ),
                      })
                    }
                    placeholder="z.B. Kulturamt"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setForm({
                        ...form,
                        nameLines: form.nameLines.filter((_, idx) => idx !== i),
                      })
                    }
                    title="Zeile entfernen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setForm({ ...form, nameLines: [...form.nameLines, ""] })}
              >
                <Plus className="h-4 w-4" /> Zeile hinzufügen
              </Button>
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
          </DialogBody>

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
