"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { saveDayFactorMap } from "./settings-actions";

export function DayFactorForm({ initial }: { initial: Record<number, number> }) {
  const [values, setValues] = useState<Record<number, string>>(() => {
    const out: Record<number, string> = {};
    for (let d = 1; d <= 10; d++) {
      out[d] = String(initial[d] ?? d);
    }
    return out;
  });
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed: Record<number, number> = {};
    for (let d = 1; d <= 10; d++) {
      const n = Number(values[d].replace(",", "."));
      if (!isFinite(n) || n < 0) {
        toast.error(`Faktor für ${d} Tag(e) ungültig.`);
        return;
      }
      parsed[d] = n;
    }
    startTransition(async () => {
      try {
        await saveDayFactorMap(parsed);
        toast.success("Faktoren gespeichert");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2 max-w-sm">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((d) => (
          <div key={d} className="grid grid-cols-[80px_1fr] items-center gap-3">
            <Label htmlFor={`f${d}`} className="text-sm">
              {d} {d === 1 ? "Tag" : "Tage"}
            </Label>
            <Input
              id={`f${d}`}
              value={values[d]}
              onChange={(e) =>
                setValues((v) => ({ ...v, [d]: e.target.value }))
              }
              inputMode="decimal"
              className="font-mono"
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Bei mehr als 10 Tagen wird linear fortgesetzt: Faktor[10] + (Tage − 10).
        Beispiel: Bei Faktor[10] = 5,5 sind 12 Tage = 7,5.
      </p>
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
