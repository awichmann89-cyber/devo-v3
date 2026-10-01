"use client";

import { useState, useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { saveCompanyFooterToggle } from "./settings-actions";
import { toastError } from "@/lib/toast";
import type { CompanyFooterDocument } from "@/lib/company-footer";

interface Props {
  document: CompanyFooterDocument;
  initialEnabled: boolean;
}

/**
 * Schalter „Firmendaten in der Fußzeile drucken" für eine Dokumentart.
 * Speichert direkt beim Umschalten.
 */
export function CompanyFooterToggle({ document, initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();
  const id = `companyFooter-${document}`;

  function handleChange(next: boolean) {
    setEnabled(next);
    startTransition(async () => {
      try {
        await saveCompanyFooterToggle(document, next);
        toast.success(next ? "Fußzeile eingeschaltet" : "Fußzeile ausgeschaltet");
      } catch (err) {
        setEnabled(!next);
        toastError(err, "Speichern");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          checked={enabled}
          disabled={pending}
          onCheckedChange={(v) => handleChange(v === true)}
        />
        <Label htmlFor={id} className="cursor-pointer font-normal">
          Firmendaten (Anschrift, Kontakt, Bankverbindung, Steuernummer) in der
          Fußzeile drucken
        </Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Ausgeschaltet lassen, wenn das Briefpapier diese Angaben bereits enthält.
        Gilt für neu erstellte Dokumente — bereits ausgegebene bleiben unverändert.
        Die Daten pflegst du im Tab Firmendaten.
      </p>
    </div>
  );
}
