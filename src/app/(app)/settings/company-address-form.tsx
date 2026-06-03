"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { saveCompanyAddress } from "./settings-actions";

interface Props {
  initialName: string;
  initialStreet: string;
  initialZipCity: string;
  initialVatPercent: number;
}

export function CompanyAddressForm({
  initialName,
  initialStreet,
  initialZipCity,
  initialVatPercent,
}: Props) {
  const [name, setName] = useState(initialName);
  const [street, setStreet] = useState(initialStreet);
  const [zipCity, setZipCity] = useState(initialZipCity);
  const [vat, setVat] = useState(initialVatPercent);
  const [pending, startTransition] = useTransition();

  const previewLine = [name, street, zipCity].filter(Boolean).join(" · ");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await saveCompanyAddress(name, street, zipCity, vat);
        toast.success("Firmenadresse gespeichert");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="companyName">Firmenname</Label>
        <Input
          id="companyName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z.B. Musterfirma GmbH"
          maxLength={200}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="companyStreet">Straße + Hausnummer</Label>
          <Input
            id="companyStreet"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            placeholder="z.B. Musterstraße 1"
            maxLength={200}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="companyZipCity">PLZ + Stadt</Label>
          <Input
            id="companyZipCity"
            value={zipCity}
            onChange={(e) => setZipCity(e.target.value)}
            placeholder="z.B. 12345 Berlin"
            maxLength={200}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="vatPercent">Mehrwertsteuersatz (%)</Label>
        <Input
          id="vatPercent"
          type="number"
          step="0.1"
          min="0"
          max="100"
          value={vat}
          onChange={(e) => setVat(Number(e.target.value) || 0)}
          className="max-w-[140px]"
        />
        <p className="text-xs text-muted-foreground">
          Wird auf Rechnungen als MwSt. aus dem Nettobetrag berechnet. Deutschland Regel: 19 %.
        </p>
      </div>

      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
          Vorschau (Versenderzeile auf der Rechnung)
        </div>
        <div className="font-mono text-xs">
          {previewLine || (
            <span className="italic text-muted-foreground">— noch nicht ausgefüllt —</span>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Speichern
        </Button>
      </div>
    </form>
  );
}
