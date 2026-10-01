"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { InfoHint } from "@/components/ui/info-hint";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import {
  saveQuoteEmailTexts,
  saveOrderConfirmationEmailTexts,
  saveInvoiceEmailTexts,
} from "./settings-actions";
import { toastError } from "@/lib/toast";

const PLACEHOLDER_HINT =
  'Platzhalter: {{kunde}}, {{nummer}}, {{projekt}} — werden beim Öffnen des "Per E-Mail senden"-Dialogs ersetzt.';

type Kind = "quote" | "orderConfirmation" | "invoice";

const CONFIG: Record<
  Kind,
  { save: (subject: string, body: string) => Promise<void>; subjectPlaceholder: string }
> = {
  quote: {
    save: saveQuoteEmailTexts,
    subjectPlaceholder: "Ihr Angebot {{nummer}} — {{projekt}}",
  },
  orderConfirmation: {
    save: saveOrderConfirmationEmailTexts,
    subjectPlaceholder: "Ihre Auftragsbestätigung {{nummer}} — {{projekt}}",
  },
  invoice: {
    save: saveInvoiceEmailTexts,
    subjectPlaceholder: "Ihre Rechnung {{nummer}} — {{projekt}}",
  },
};

interface Props {
  kind: Kind;
  initialSubject: string;
  initialBody: string;
}

/** Vorlage für Betreff/Text des "Per E-Mail senden"-Dialogs je Dokumentart. */
export function EmailTextsForm({ kind, initialSubject, initialBody }: Props) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [pending, startTransition] = useTransition();
  const { save, subjectPlaceholder } = CONFIG[kind];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await save(subject, body);
        toast.success("E-Mail-Text gespeichert");
      } catch (err) {
        toastError(err, "Speichern");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor={`${kind}EmailSubject`}>Betreff</Label>
          <InfoHint text={PLACEHOLDER_HINT} />
        </div>
        <Input
          id={`${kind}EmailSubject`}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={subjectPlaceholder}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor={`${kind}EmailBody`}>Text</Label>
          <InfoHint text={PLACEHOLDER_HINT} />
        </div>
        <Textarea
          id={`${kind}EmailBody`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder="Guten Tag {{kunde}}, …"
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
