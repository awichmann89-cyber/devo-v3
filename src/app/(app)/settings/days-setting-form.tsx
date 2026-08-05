"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QuantityInput } from "@/components/ui/quantity-input";
import { Label } from "@/components/ui/label";
import { InfoHint } from "@/components/ui/info-hint";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

interface Props {
  /** Aktueller Wert in Tagen */
  initial: number;
  /** Label über dem Input, z.B. „Zahlungsfrist (Tage)" */
  label: string;
  /** Beschreibungstext unter dem Input */
  description: string;
  /** Server-Action, die die Zahl persistiert */
  onSave: (days: number) => Promise<void>;
  /** Toast-Nachricht nach erfolgreichem Speichern */
  successMessage: string;
}

/**
 * Generisches Mini-Form für eine einzelne „Tage"-Einstellung — wiederverwendbar
 * für Rechnungs-Zahlungsfrist und Angebots-Gültigkeit.
 */
export function DaysSettingForm({
  initial,
  label,
  description,
  onSave,
  successMessage,
}: Props) {
  const [days, setDays] = useState(initial);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await onSave(days);
        toast.success(successMessage);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2 max-w-[200px]">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="days-setting">{label}</Label>
          <InfoHint text={description} />
        </div>
        <QuantityInput
          id="days-setting"
          min={0}
          max={365}
          value={days}
          onChange={(v) => setDays(v)}
        />
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
