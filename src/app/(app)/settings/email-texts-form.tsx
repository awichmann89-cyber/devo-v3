"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { saveEmailTexts } from "./settings-actions";
import { toastError } from "@/lib/toast";

interface Props {
  initialQuoteSubject: string;
  initialQuoteBody: string;
  initialInvoiceSubject: string;
  initialInvoiceBody: string;
}

const PLACEHOLDER_HINT =
  'Platzhalter: {{kunde}}, {{nummer}}, {{projekt}} — werden beim Öffnen des "Per E-Mail senden"-Dialogs ersetzt.';

export function EmailTextsForm({
  initialQuoteSubject,
  initialQuoteBody,
  initialInvoiceSubject,
  initialInvoiceBody,
}: Props) {
  const [quoteSubject, setQuoteSubject] = useState(initialQuoteSubject);
  const [quoteBody, setQuoteBody] = useState(initialQuoteBody);
  const [invoiceSubject, setInvoiceSubject] = useState(initialInvoiceSubject);
  const [invoiceBody, setInvoiceBody] = useState(initialInvoiceBody);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await saveEmailTexts(quoteSubject, quoteBody, invoiceSubject, invoiceBody);
        toast.success("E-Mail-Texte gespeichert");
      } catch (err) {
        toastError(err, "Speichern");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-1.5">
        <p className="text-sm text-muted-foreground">{PLACEHOLDER_HINT}</p>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium">Angebot</h3>
        <div className="space-y-2">
          <Label htmlFor="quoteEmailSubject">Betreff</Label>
          <Input
            id="quoteEmailSubject"
            value={quoteSubject}
            onChange={(e) => setQuoteSubject(e.target.value)}
            placeholder="Ihr Angebot {{nummer}} — {{projekt}}"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quoteEmailBody">Text</Label>
          <Textarea
            id="quoteEmailBody"
            value={quoteBody}
            onChange={(e) => setQuoteBody(e.target.value)}
            rows={6}
            placeholder="Guten Tag {{kunde}}, …"
          />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium">Rechnung</h3>
        <div className="space-y-2">
          <Label htmlFor="invoiceEmailSubject">Betreff</Label>
          <Input
            id="invoiceEmailSubject"
            value={invoiceSubject}
            onChange={(e) => setInvoiceSubject(e.target.value)}
            placeholder="Ihre Rechnung {{nummer}} — {{projekt}}"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invoiceEmailBody">Text</Label>
          <Textarea
            id="invoiceEmailBody"
            value={invoiceBody}
            onChange={(e) => setInvoiceBody(e.target.value)}
            rows={6}
            placeholder="Guten Tag {{kunde}}, …"
          />
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
