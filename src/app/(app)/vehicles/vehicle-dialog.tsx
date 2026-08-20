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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { VehicleKind } from "@prisma/client";
import { vehicleKindLabel } from "@/lib/labels";
import { createVehicle, updateVehicle } from "./actions";
import { toastError } from "@/lib/toast";

/** Fuhrpark-Einheit (Client-VM). */
export interface VehicleVM {
  id: string;
  name: string;
  kind: VehicleKind;
  licensePlate: string | null;
  loadCapacityKg: number | null;
  grossWeightKg: number | null;
  requiredLicense: string | null;
  /** ISO-Datum oder null (HU/TÜV fällig). */
  nextInspection: string | null;
  notes: string | null;
  active: boolean;
}

/** ISO-Instant → Wert für <input type="date"> (Browser-Lokalzeit). */
function isoToDateInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle?: VehicleVM | null;
}

export function VehicleDialog({ open, onOpenChange, vehicle }: Props) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<VehicleKind>("FAHRZEUG");
  const [licensePlate, setLicensePlate] = useState("");
  const [loadCapacityKg, setLoadCapacityKg] = useState("");
  const [grossWeightKg, setGrossWeightKg] = useState("");
  const [requiredLicense, setRequiredLicense] = useState("");
  const [nextInspection, setNextInspection] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setName(vehicle?.name ?? "");
    setKind(vehicle?.kind ?? "FAHRZEUG");
    setLicensePlate(vehicle?.licensePlate ?? "");
    setLoadCapacityKg(
      vehicle?.loadCapacityKg != null ? String(vehicle.loadCapacityKg) : ""
    );
    setGrossWeightKg(
      vehicle?.grossWeightKg != null ? String(vehicle.grossWeightKg) : ""
    );
    setRequiredLicense(vehicle?.requiredLicense ?? "");
    setNextInspection(
      vehicle?.nextInspection ? isoToDateInput(vehicle.nextInspection) : ""
    );
    setNotes(vehicle?.notes ?? "");
    setActive(vehicle?.active ?? true);
  }, [open, vehicle]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!name.trim()) {
      toast.error("Name darf nicht leer sein");
      return;
    }

    const payload = {
      name: name.trim(),
      kind,
      licensePlate: licensePlate || null,
      loadCapacityKg: loadCapacityKg !== "" ? Number(loadCapacityKg) : null,
      grossWeightKg: grossWeightKg !== "" ? Number(grossWeightKg) : null,
      requiredLicense: requiredLicense || null,
      nextInspection: nextInspection !== "" ? new Date(nextInspection) : null,
      notes: notes || null,
      active,
    };

    startTransition(async () => {
      try {
        if (vehicle) {
          await updateVehicle(vehicle.id, payload);
          toast.success("Fuhrpark-Einheit aktualisiert");
        } else {
          await createVehicle(payload);
          toast.success("Fuhrpark-Einheit angelegt");
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
          <DialogTitle>
            {vehicle ? "Fuhrpark-Einheit bearbeiten" : "Fuhrpark-Einheit anlegen"}
          </DialogTitle>
          <DialogDescription>
            Fahrzeug oder Anhänger für die Transport-Disposition. Einheiten werden
            im Projekt an Transport-Positionen eingeplant und dort für den
            Planungszeitraum geblockt.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="v-name">Bezeichnung</Label>
              <Input
                id="v-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Sprinter groß"
                maxLength={150}
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Art</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as VehicleKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(VehicleKind).map((k) => (
                    <SelectItem key={k} value={k}>
                      {vehicleKindLabel(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="v-plate">Kennzeichen (optional)</Label>
              <Input
                id="v-plate"
                value={licensePlate}
                onChange={(e) => setLicensePlate(e.target.value)}
                placeholder="z.B. HH-AB 1234"
                maxLength={20}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="v-license">Führerscheinklasse (optional)</Label>
                <InfoHint text="Wird beim Einplanen als Hinweis angezeigt — z.B. BE für Gespanne oder C1 für den 7,5-Tonner." />
              </div>
              <Input
                id="v-license"
                value={requiredLicense}
                onChange={(e) => setRequiredLicense(e.target.value)}
                placeholder="z.B. BE"
                maxLength={20}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="v-load">Zuladung (kg)</Label>
              <Input
                id="v-load"
                type="number"
                step="1"
                min="0"
                value={loadCapacityKg}
                onChange={(e) => setLoadCapacityKg(e.target.value)}
                placeholder="z.B. 1200"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-gross">Zul. Gesamtgewicht (kg)</Label>
              <Input
                id="v-gross"
                type="number"
                step="1"
                min="0"
                value={grossWeightKg}
                onChange={(e) => setGrossWeightKg(e.target.value)}
                placeholder="z.B. 3500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-inspection">HU/TÜV fällig</Label>
              <Input
                id="v-inspection"
                type="date"
                value={nextInspection}
                onChange={(e) => setNextInspection(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="v-notes">Notizen (optional)</Label>
            <Textarea
              id="v-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Interne Hinweise, z.B. Ladefläche 4,30 m, Hebebühne"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="v-active"
              checked={active}
              onCheckedChange={(v) => setActive(v === true)}
            />
            <Label htmlFor="v-active" className="cursor-pointer font-normal">
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
              {vehicle ? "Speichern" : "Anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
