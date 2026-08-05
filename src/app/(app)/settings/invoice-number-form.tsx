"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QuantityInput } from "@/components/ui/quantity-input";
import { Label } from "@/components/ui/label";
import { InfoHint } from "@/components/ui/info-hint";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { saveInvoiceNumberSettings } from "./settings-actions";
import { buildInvoiceNumber } from "@/lib/settings";

interface Props {
  initialPrefix: string;
  initialPadding: number;
  initialNextSequence: number;
  /** Höchste bereits vergebene Sequenz im laufenden Jahr (für Vorschau + Validierung) */
  currentYearMax: number;
  year: number;
}

export function InvoiceNumberForm({
  initialPrefix,
  initialPadding,
  initialNextSequence,
  currentYearMax,
  year,
}: Props) {
  const [prefix, setPrefix] = useState(initialPrefix);
  const [padding, setPadding] = useState(initialPadding);
  const [nextSeq, setNextSeq] = useState(initialNextSequence);
  const [pending, startTransition] = useTransition();

  // Effektive nächste Sequenz: max(Eingabe, vorhandenesMax+1)
  const effectiveNext = Math.max(nextSeq, currentYearMax + 1);
  const preview = buildInvoiceNumber(
    year,
    effectiveNext,
    prefix.trim().toUpperCase(),
    padding
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await saveInvoiceNumberSettings(prefix, padding, nextSeq);
        toast.success("Rechnungsnummer-Einstellungen gespeichert");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler");
      }
    });
  }

  const wouldBeBumped = effectiveNext > nextSeq;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="prefix">Prefix (optional)</Label>
            <InfoHint text="Großbuchstaben, Zahlen, Bindestriche." />
          </div>
          <Input
            id="prefix"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder="z.B. PA"
            maxLength={10}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="padding">Stellen für Sequenz</Label>
            <InfoHint text="3 → 001, 4 → 0001." />
          </div>
          <QuantityInput
            id="padding"
            min={1}
            max={8}
            value={padding}
            onChange={(v) => setPadding(v)}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="nextSeq">Nächste Nummer</Label>
            <InfoHint text="Sequenz, mit der die nächste Rechnung erstellt wird." />
          </div>
          <QuantityInput
            id="nextSeq"
            min={1}
            value={nextSeq}
            onChange={(v) => setNextSeq(v)}
          />
        </div>
      </div>

      {currentYearMax > 0 && wouldBeBumped && (
        <div className="rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs">
          Hinweis: Im aktuellen Jahr existiert bereits Sequenz{" "}
          <strong>{currentYearMax}</strong>. Niedrigere Werte für „Nächste
          Nummer" werden automatisch auf <strong>{currentYearMax + 1}</strong>{" "}
          angehoben, damit keine Doppel-Nummern entstehen.
        </div>
      )}

      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
          Vorschau für die nächste Rechnung
        </div>
        <div className="font-mono text-base font-medium">{preview}</div>
        {currentYearMax > 0 && (
          <div className="mt-1 text-xs text-muted-foreground">
            Im Jahr {year} bereits vergeben bis Sequenz {currentYearMax}.
          </div>
        )}
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
