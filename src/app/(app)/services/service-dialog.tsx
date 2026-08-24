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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BillingUnit, ServiceItemKind } from "@prisma/client";
import { billingUnitLabel, serviceItemKindLabel } from "@/lib/labels";
import {
  vehicleOptionHint,
  type VehicleOptionVM,
} from "../vehicles/vehicle-dialog";
import { createServiceItem, updateServiceItem } from "./actions";
import { toastError } from "@/lib/toast";

export interface ServiceItemVM {
  id: string;
  /** Interne Bezeichnung — Katalog, Projekt, Personal-/Fuhrparkplanung. */
  name: string;
  /** Bezeichnung für Angebot und Rechnung; leer = interne Bezeichnung. */
  externalName?: string | null;
  description?: string | null;
  kind: ServiceItemKind;
  unit: BillingUnit;
  unitPrice: number;
  active: boolean;
  /**
   * Standard-Fuhrpark-Einheit (nur Transport): wird beim Buchen der Position
   * automatisch als Einsatz angelegt.
   */
  defaultVehicleId?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: ServiceItemVM | null;
  onCreated?: (item: ServiceItemVM) => void;
  /** Aktive Fuhrpark-Einheiten für die Vorbelegung von Transport-Positionen. */
  vehicles?: VehicleOptionVM[];
}

export function ServiceItemDialog({
  open,
  onOpenChange,
  item,
  onCreated,
  vehicles = [],
}: Props) {
  const [name, setName] = useState("");
  const [externalName, setExternalName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<ServiceItemKind>("PERSONAL");
  const [unit, setUnit] = useState<BillingUnit>("HOUR");
  const [unitPrice, setUnitPrice] = useState("0");
  const [active, setActive] = useState(true);
  const [defaultVehicleId, setDefaultVehicleId] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setName(item?.name ?? "");
      setExternalName(item?.externalName ?? "");
      setDescription(item?.description ?? "");
      setKind(item?.kind ?? "PERSONAL");
      setUnit(item?.unit ?? "HOUR");
      setUnitPrice(item ? String(item.unitPrice) : "0");
      setActive(item?.active ?? true);
      setDefaultVehicleId(item?.defaultVehicleId ?? "");
    }
  }, [open, item]);

  // Transport (Fahrzeuge/Anhänger) wird immer pauschal berechnet — die
  // Einheit folgt automatisch und ist nicht wählbar.
  const unitLocked = kind === "TRANSPORT";
  useEffect(() => {
    if (unitLocked && unit !== "FLAT") setUnit("FLAT");
  }, [unitLocked, unit]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!name.trim()) {
      toast.error("Name darf nicht leer sein");
      return;
    }

    const payload = {
      name: name.trim(),
      // Leer lassen ist erlaubt — dann wird die interne Bezeichnung gedruckt.
      externalName: externalName.trim() || null,
      description: description || null,
      kind,
      unit,
      unitPrice: Number(unitPrice) || 0,
      active,
      // Vorbelegung nur an Transport-Positionen (der Server verwirft sie sonst).
      defaultVehicleId: unitLocked ? defaultVehicleId || null : null,
    };

    startTransition(async () => {
      try {
        if (item) {
          await updateServiceItem(item.id, payload);
          toast.success("Position aktualisiert");
        } else {
          const created = await createServiceItem(payload);
          toast.success("Position angelegt");
          onCreated?.(created);
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
          <DialogTitle>{item ? "Position bearbeiten" : "Position anlegen"}</DialogTitle>
          <DialogDescription>
            Personal- oder Transport-Position für die Angebotskalkulation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="si-name">Interne Bezeichnung</Label>
              <InfoHint text="Erscheint im Katalog, im Projekt und in der Personal- bzw. Fuhrparkplanung — nicht auf Angebot und Rechnung." />
            </div>
            <Input
              id="si-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Tagessatz LT Senior"
              maxLength={150}
              autoFocus
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="si-ext-name">Externe Bezeichnung (optional)</Label>
              <InfoHint text="Wird auf Angebot und Rechnung gedruckt. Leer lassen, wenn die interne Bezeichnung beim Kunden stehen darf." />
            </div>
            <Input
              id="si-ext-name"
              value={externalName}
              onChange={(e) => setExternalName(e.target.value)}
              placeholder={name.trim() || "z.B. Lichttechniker"}
              maxLength={150}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Art</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as ServiceItemKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(ServiceItemKind).map((k) => (
                    <SelectItem key={k} value={k}>
                      {serviceItemKindLabel(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label>Einheit</Label>
                {unitLocked && (
                  <InfoHint text="Transport wird immer pauschal gerechnet — Fahrzeuge und Anhänger werden im Projekt eingeplant und für den Planungszeitraum geblockt." />
                )}
              </div>
              <Select
                value={unit}
                onValueChange={(v) => setUnit(v as BillingUnit)}
                disabled={unitLocked}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(BillingUnit).map((u) => (
                    <SelectItem key={u} value={u}>
                      {billingUnitLabel(u)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="si-price">
              {unitLocked ? "Pauschalpreis (€)" : "Preis pro Einheit (€)"}
            </Label>
            <Input
              id="si-price"
              type="number"
              step="0.01"
              min="0"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              required
            />
          </div>

          {unitLocked && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label>Fahrzeug/Anhänger (optional)</Label>
                <InfoHint text="Wird beim Buchen dieser Position automatisch eingeplant und für den Planungszeitraum geblockt — ein Klick statt zwei Dialoge. Im Projekt bleibt der Einsatz änder- und löschbar." />
              </div>
              <Combobox
                value={defaultVehicleId}
                onValueChange={setDefaultVehicleId}
                options={vehicles.map((v) => ({
                  value: v.id,
                  label: v.name,
                  hint: vehicleOptionHint(v),
                }))}
                emptyLabel="— keine Vorbelegung —"
                placeholder="Bezeichnung oder Kennzeichen suchen…"
                clearable
              />
              {vehicles.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Noch keine aktiven Einheiten — lege sie unter Stammdaten →
                  Fuhrpark an.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="si-desc">Beschreibung (optional)</Label>
            <Textarea
              id="si-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Interne Hinweise, z.B. inklusive Anreise im Umkreis 50 km"
            />
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
              {item ? "Speichern" : "Anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
