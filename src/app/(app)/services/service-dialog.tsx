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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BillingUnit, ServiceItemKind } from "@prisma/client";
import { billingUnitLabel, serviceItemKindLabel } from "@/lib/labels";
import { createServiceItem, updateServiceItem } from "./actions";

export interface ServiceItemVM {
  id: string;
  name: string;
  description?: string | null;
  kind: ServiceItemKind;
  unit: BillingUnit;
  unitPrice: number;
  active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: ServiceItemVM | null;
  onCreated?: (item: ServiceItemVM) => void;
}

export function ServiceItemDialog({ open, onOpenChange, item, onCreated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<ServiceItemKind>("PERSONAL");
  const [unit, setUnit] = useState<BillingUnit>("HOUR");
  const [unitPrice, setUnitPrice] = useState("0");
  const [active, setActive] = useState(true);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setName(item?.name ?? "");
      setDescription(item?.description ?? "");
      setKind(item?.kind ?? "PERSONAL");
      setUnit(item?.unit ?? "HOUR");
      setUnitPrice(item ? String(item.unitPrice) : "0");
      setActive(item?.active ?? true);
    }
  }, [open, item]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!name.trim()) {
      toast.error("Name darf nicht leer sein");
      return;
    }

    const payload = {
      name: name.trim(),
      description: description || null,
      kind,
      unit,
      unitPrice: Number(unitPrice) || 0,
      active,
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
        toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Position bearbeiten" : "Position anlegen"}</DialogTitle>
          <DialogDescription>
            Personal- oder Transport-Position für die Angebotskalkulation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="si-name">Bezeichnung</Label>
            <Input
              id="si-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Tagessatz Lichttechniker"
              maxLength={150}
              autoFocus
              required
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
              <Label>Einheit</Label>
              <Select value={unit} onValueChange={(v) => setUnit(v as BillingUnit)}>
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
            <Label htmlFor="si-price">Preis pro Einheit (€)</Label>
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

          <div className="flex items-center gap-2">
            <Checkbox
              id="si-active"
              checked={active}
              onCheckedChange={(v) => setActive(v === true)}
            />
            <Label htmlFor="si-active" className="text-sm font-normal cursor-pointer">
              Aktiv (im Projekt-Katalog auswählbar)
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
              {item ? "Speichern" : "Anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
