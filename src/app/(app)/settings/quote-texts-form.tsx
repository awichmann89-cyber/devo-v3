"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { InfoHint } from "@/components/ui/info-hint";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { saveQuoteTexts, saveOrderConfirmationTexts } from "./settings-actions";
import { toastError } from "@/lib/toast";

const VARIANTS = {
  quote: {
    save: saveQuoteTexts,
    idPrefix: "quote",
    successMessage: "Angebots-Texte gespeichert",
    introHint:
      "Wird im Angebots-PDF zwischen den Meta-Daten (Datum, Projekt) und der Positionstabelle ausgegeben.",
    outroHint:
      'Wird im Angebots-PDF nach der Tabelle ausgegeben (und nach einem optionalen Hinweistext aus dem Angebots-Dialog), gefolgt von „Mit freundlichen Grüßen" und der Signatur.',
    outroPlaceholder: "Grundlage dieses Angebots sind unsere AGB …",
  },
  orderConfirmation: {
    save: saveOrderConfirmationTexts,
    idPrefix: "oc",
    successMessage: "Texte gespeichert",
    introHint:
      "Wird im PDF der Auftragsbestätigung zwischen den Meta-Daten (Datum, Bezug, Projekt) und der Positionstabelle ausgegeben.",
    outroHint:
      'Wird nach der Tabelle ausgegeben (und nach einem optionalen Hinweistext aus dem Dialog), gefolgt von „Mit freundlichen Grüßen" und der Signatur.',
    outroPlaceholder: "Grundlage dieses Auftrags sind unsere AGB …",
  },
} as const;

interface Props {
  /** Welches Dokument — Angebot (Default) oder Auftragsbestätigung. */
  variant?: keyof typeof VARIANTS;
  initialIntro: string;
  initialOutro: string;
}

export function QuoteTextsForm({ variant = "quote", initialIntro, initialOutro }: Props) {
  const v = VARIANTS[variant];
  const [intro, setIntro] = useState(initialIntro);
  const [outro, setOutro] = useState(initialOutro);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await v.save(intro, outro);
        toast.success(v.successMessage);
      } catch (err) {
        toastError(err, "Speichern");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor={`${v.idPrefix}Intro`}>Text vor der Positionstabelle</Label>
          <InfoHint text={v.introHint} />
        </div>
        <Textarea
          id={`${v.idPrefix}Intro`}
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          rows={6}
          placeholder="Sehr geehrte Damen und Herren, …"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor={`${v.idPrefix}Outro`}>Text nach der Positionstabelle</Label>
          <InfoHint text={v.outroHint} />
        </div>
        <Textarea
          id={`${v.idPrefix}Outro`}
          value={outro}
          onChange={(e) => setOutro(e.target.value)}
          rows={6}
          placeholder={v.outroPlaceholder}
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
