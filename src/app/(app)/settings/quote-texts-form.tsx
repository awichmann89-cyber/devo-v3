"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { saveQuoteTexts } from "./settings-actions";

interface Props {
  initialIntro: string;
  initialOutro: string;
}

export function QuoteTextsForm({ initialIntro, initialOutro }: Props) {
  const [intro, setIntro] = useState(initialIntro);
  const [outro, setOutro] = useState(initialOutro);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await saveQuoteTexts(intro, outro);
        toast.success("Angebots-Texte gespeichert");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="quoteIntro">Text vor der Positionstabelle</Label>
        <Textarea
          id="quoteIntro"
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          rows={6}
          placeholder="Sehr geehrte Damen und Herren, …"
        />
        <p className="text-xs text-muted-foreground">
          Wird im Angebots-PDF zwischen den Meta-Daten (Datum, Projekt) und
          der Positionstabelle ausgegeben.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="quoteOutro">Text nach der Positionstabelle</Label>
        <Textarea
          id="quoteOutro"
          value={outro}
          onChange={(e) => setOutro(e.target.value)}
          rows={6}
          placeholder="Grundlage dieses Angebots sind unsere AGB …"
        />
        <p className="text-xs text-muted-foreground">
          Wird im Angebots-PDF nach der Tabelle ausgegeben (und nach einem
          optionalen Hinweistext aus dem Angebots-Dialog), gefolgt von „Mit
          freundlichen Grüßen" und der Signatur.
        </p>
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
