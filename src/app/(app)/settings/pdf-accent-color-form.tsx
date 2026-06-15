"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { savePdfAccentColor } from "./settings-actions";

interface Props {
  initialColor: string;
}

/**
 * Farbpicker für die Akzentfarbe der Angebots-/Rechnungs-PDFs.
 * Bietet einen nativen <input type="color"> plus ein Text-Feld für direkte
 * Hex-Eingabe — beide bleiben synchron. Eine Mini-Vorschau zeigt direkt, wie
 * Gruppen-Header und Trennstrich später aussehen.
 */
export function PdfAccentColorForm({ initialColor }: Props) {
  const [color, setColor] = useState(initialColor || "#1e3a8a");
  const [pending, startTransition] = useTransition();

  // Wenn der Hex-Wert aus dem Text-Feld noch nicht valide ist, soll das
  // <input type="color"> nicht crashen — wir geben dann den letzten gültigen
  // Wert vor.
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#1e3a8a";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await savePdfAccentColor(color);
        toast.success("Akzentfarbe gespeichert");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="pdfAccentColor">Akzentfarbe</Label>
        <div className="flex items-center gap-3">
          <input
            id="pdfAccentColor"
            type="color"
            value={safeColor}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-14 cursor-pointer rounded-md border border-input bg-background p-1"
          />
          <Input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#1e3a8a"
            maxLength={7}
            className="w-32 font-mono"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Wird im Angebots- und Rechnungs-PDF für die Gruppen-Überschriften
          (Hintergrundfarbe) und den Trennstrich über der Gruppen-Zwischensumme
          verwendet.
        </p>
      </div>

      {/* Mini-Vorschau, damit man direkt sieht wie der Farbton im PDF wirkt */}
      <div className="space-y-2">
        <Label>Vorschau</Label>
        <div className="overflow-hidden rounded-md border">
          <div
            className="px-3 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: safeColor }}
          >
            Gruppe „Ton"
          </div>
          <div className="px-3 py-2 text-sm text-muted-foreground">
            1× Mikrofon · 49,00 € / T
          </div>
          <div className="px-3 py-2 text-sm text-muted-foreground">
            2× Stativ · 12,00 € / T
          </div>
          <div
            className="border-t-2 px-3 py-2 text-sm font-semibold"
            style={{ borderColor: safeColor }}
          >
            <span className="float-right">73,00 €</span>
            Zwischensumme Gruppe „Ton"
          </div>
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
