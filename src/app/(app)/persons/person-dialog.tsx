"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoHint } from "@/components/ui/info-hint";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { EmploymentType } from "@prisma/client";
import { employmentTypeLabel } from "@/lib/labels";
import { createPerson, updatePerson } from "./actions";
import { toastError } from "@/lib/toast";

export interface PersonVM {
  id: string;
  name: string;
  employmentType: EmploymentType;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
  hourlyWage: number | null;
  defaultDayRate: number | null;
  /** Verknüpfter Cratel-Account (User.id) */
  userId: string | null;
}

/** Cratel-Account für die Verknüpfungs-Auswahl. */
export interface UserOptionVM {
  id: string;
  name: string | null;
  email: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person?: PersonVM | null;
  users: UserOptionVM[];
}

export function PersonDialog({ open, onOpenChange, person, users }: Props) {
  const [name, setName] = useState("");
  const [employmentType, setEmploymentType] = useState<EmploymentType>("FREELANCER");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [hourlyWage, setHourlyWage] = useState("");
  const [defaultDayRate, setDefaultDayRate] = useState("");
  const [userId, setUserId] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setName(person?.name ?? "");
      setEmploymentType(person?.employmentType ?? "FREELANCER");
      setEmail(person?.email ?? "");
      setPhone(person?.phone ?? "");
      setAddress(person?.address ?? "");
      setNotes(person?.notes ?? "");
      setActive(person?.active ?? true);
      setHourlyWage(person?.hourlyWage != null ? String(person.hourlyWage) : "");
      setDefaultDayRate(person?.defaultDayRate != null ? String(person.defaultDayRate) : "");
      setUserId(person?.userId ?? "");
    }
  }, [open, person]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!name.trim()) {
      toast.error("Name darf nicht leer sein");
      return;
    }

    const payload = {
      name: name.trim(),
      employmentType,
      email: email || null,
      phone: phone || null,
      address: address || null,
      notes: notes || null,
      active,
      hourlyWage: hourlyWage !== "" ? Number(hourlyWage) : null,
      defaultDayRate: defaultDayRate !== "" ? Number(defaultDayRate) : null,
      userId: userId || null,
    };

    startTransition(async () => {
      try {
        if (person) {
          await updatePerson(person.id, payload);
          toast.success("Person aktualisiert");
        } else {
          await createPerson(payload);
          toast.success("Person angelegt");
        }
        onOpenChange(false);
      } catch (err) {
        toastError(err, "Speichern");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{person ? "Person bearbeiten" : "Person anlegen"}</DialogTitle>
          <DialogDescription>
            Stammdaten für die Einsatzplanung. Der persönliche Link für
            Kalender-Abo und Zeiterfassung wird auf der Detailseite verwaltet.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="p-name">Name</Label>
              <Input
                id="p-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Vor- und Nachname"
                maxLength={150}
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Beschäftigungsart</Label>
              <Select
                value={employmentType}
                onValueChange={(v) => setEmploymentType(v as EmploymentType)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(EmploymentType).map((t) => (
                    <SelectItem key={t} value={t}>
                      {employmentTypeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {employmentType === "MINIJOBBER" && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="p-wage">Stundenlohn (€)</Label>
                <InfoHint text="Wird beim Erfassen von Arbeitszeiten festgeschrieben — spätere Änderungen wirken nur auf neue Einträge." />
              </div>
              <Input
                id="p-wage"
                type="number"
                step="0.01"
                min="0"
                value={hourlyWage}
                onChange={(e) => setHourlyWage(e.target.value)}
                placeholder="z.B. 14,00"
              />
            </div>
          )}

          {employmentType === "FREELANCER" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="p-dayrate">Standard-Tagessatz (€)</Label>
                <Input
                  id="p-dayrate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={defaultDayRate}
                  onChange={(e) => setDefaultDayRate(e.target.value)}
                  placeholder="z.B. 450,00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-hourrate">Standard-Stundensatz (€)</Label>
                <Input
                  id="p-hourrate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={hourlyWage}
                  onChange={(e) => setHourlyWage(e.target.value)}
                  placeholder="z.B. 45,00"
                />
              </div>
              <p className="col-span-2 -mt-2 text-xs text-muted-foreground">
                Vorbelegung für die Vergütung beim Einplanen (Tagessatz/Pauschale
                oder nach Stunden) — pro Einsatz anpassbar.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="p-email">E-Mail (optional)</Label>
              <Input
                id="p-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={150}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-phone">Telefon (optional)</Label>
              <Input
                id="p-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={50}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="p-address">Adresse (optional)</Label>
            <Textarea
              id="p-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              maxLength={500}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="p-notes">Notizen (optional)</Label>
            <Textarea
              id="p-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Interne Hinweise, z.B. Führerschein Klasse C1"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label>Cratel-Account (optional)</Label>
              <InfoHint text="Verknüpfte Accounts sehen ihre Einsätze auf der Kalender-Seite und bekommen dort das persönliche Personalplanungs-Abo." />
            </div>
            <Combobox
              value={userId}
              onValueChange={setUserId}
              options={users.map((u) => ({
                value: u.id,
                label: u.name ?? u.email,
                hint: u.name ? u.email : undefined,
              }))}
              emptyLabel="— kein Account verknüpft —"
              placeholder="Account suchen…"
              clearable
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="p-active"
              checked={active}
              onCheckedChange={(v) => setActive(v === true)}
            />
            <Label htmlFor="p-active" className="cursor-pointer font-normal">
              Aktiv — kann auf Projekte eingeplant werden
            </Label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {person ? "Speichern" : "Anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
