"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { updatePackUnitStock } from "../actions";
import { toast } from "sonner";
import { toastError } from "@/lib/toast";

interface Props {
  packUnitId: string;
  stockQuantity: number;
  /** Anzahl Geräte pro Packeinheit (für die Gesamt-Anzeige) */
  devicesPerUnit: number;
}

export function StockEditor({ packUnitId, stockQuantity, devicesPerUnit }: Props) {
  const [value, setValue] = useState(stockQuantity.toString());
  const [pending, startTransition] = useTransition();

  function commit() {
    const n = parseInt(value, 10);
    if (!Number.isInteger(n) || n < 1) {
      setValue(stockQuantity.toString());
      return;
    }
    if (n === stockQuantity) return;
    startTransition(async () => {
      try {
        await updatePackUnitStock(packUnitId, n);
        toast.success("Lagerbestand aktualisiert");
      } catch (e) {
        toastError(e, "Speichern");
        setValue(stockQuantity.toString());
      }
    });
  }

  const current = parseInt(value, 10);
  const computedTotal =
    Number.isInteger(current) && current > 0 ? current * devicesPerUnit : 0;

  return (
    <>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min="1"
          step="1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setValue(stockQuantity.toString());
              (e.target as HTMLInputElement).blur();
            }
          }}
          disabled={pending}
          className="num h-8 w-16"
        />
        <span className="text-sm text-muted-foreground">× Packeinheit</span>
      </div>
      {current > 1 && devicesPerUnit > 0 && (
        <div className="text-xs text-muted-foreground mt-0.5">
          = {computedTotal} Geräte gesamt
        </div>
      )}
    </>
  );
}
