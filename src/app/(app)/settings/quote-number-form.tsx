"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QuantityInput } from "@/components/ui/quantity-input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { saveQuoteNumberSettings } from "./settings-actions";
import { buildQuoteNumber } from "@/lib/settings";

interface Props {
  initialPrefix: string;
  initialPadding: number;
  initialNextSequence: number;
  currentYearMax: number;
  year: number;
}

export function QuoteNumberForm({
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

  const effectiveNext = Math.max(nextSeq, currentYearMax + 1);
  const preview = buildQuoteNumber(
    year,
    effectiveNext,
    prefix.trim().toUpperCase(),
    padding
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await saveQuoteNumberSettings(prefix, padding, nextSeq);
        toast.success("Angebotsnummer-Einstellungen gespeichert");
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
          <Label htmlFor="qprefix">Prefix (optional)</Label>
          <Input
            id="qprefix"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder="z.B. AN"
            maxLength={10}
          />
          <p className="text-xs text-muted-foreground">
            Großbuchstaben, Zahlen, Bindestriche.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="qpadding">Stellen für Sequenz</Label>
          <QuantityInput
            id="qpadding"
            min={1}
            max={8}
            value={padding}
            onChange={(v) => setPadding(v)}
          />
          <p className="text-xs text-muted-foreground">
            3 → 001, 4 → 0001.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="qnextSeq">Nächste Nummer</Label>
          <QuantityInput
            id="qnextSeq"
            min={1}
            value={nextSeq}
            onChange={(v) => setNextSeq(v)}
          />
          <p className="text-xs text-muted-foreground">
            Sequenz, mit der das nächste Angebot erstellt wird.
          </p>
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
          Vorschau für das nächste Angebot
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
