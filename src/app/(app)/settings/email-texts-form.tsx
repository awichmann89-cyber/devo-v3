"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { InfoHint } from "@/components/ui/info-hint";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { saveQuoteEmailTexts, saveInvoiceEmailTexts } from "./settings-actions";
import { toastError } from "@/lib/toast";

const PLACEHOLDER_HINT =
  'Platzhalter: {{kunde}}, {{nummer}}, {{projekt}} — werden beim Öffnen des "Per E-Mail senden"-Dialogs ersetzt.';

interface Props {
  initialSubject: string;
  initialBody: string;
}

export function QuoteEmailTextsForm({ initialSubject, initialBody }: Props) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await saveQuoteEmailTexts(subject, body);
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
          <Label htmlFor="quoteEmailSubject">Betreff</Label>
          <InfoHint text={PLACEHOLDER_HINT} />
        </div>
        <Input
          id="quoteEmailSubject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Ihr Angebot {{nummer}} — {{projekt}}"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="quoteEmailBody">Text</Label>
          <InfoHint text={PLACEHOLDER_HINT} />
        </div>
        <Textarea
          id="quoteEmailBody"
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

export function InvoiceEmailTextsForm({ initialSubject, initialBody }: Props) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await saveInvoiceEmailTexts(subject, body);
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
          <Label htmlFor="invoiceEmailSubject">Betreff</Label>
          <InfoHint text={PLACEHOLDER_HINT} />
        </div>
        <Input
          id="invoiceEmailSubject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Ihre Rechnung {{nummer}} — {{projekt}}"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="invoiceEmailBody">Text</Label>
          <InfoHint text={PLACEHOLDER_HINT} />
        </div>
        <Textarea
          id="invoiceEmailBody"
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
