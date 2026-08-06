"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoHint } from "@/components/ui/info-hint";
import { Copy, RefreshCw, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { regenerateCalendarToken } from "../settings/settings-actions";
import { toastError } from "@/lib/toast";

export function CalendarFeedForm({
  initialToken,
  personalToken,
}: {
  initialToken: string;
  /** Token der mit dem eingeloggten Account verknüpften Person — speist das
   *  persönliche Personalplanungs-Abo. Null, wenn keine Person verknüpft ist. */
  personalToken?: string | null;
}) {
  const [token, setToken] = useState(initialToken);
  const [origin, setOrigin] = useState("");
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const planningUrl = origin && token
    ? `${origin}/api/calendar/planning.ics?token=${token}`
    : "";
  const billingUrl = origin && token
    ? `${origin}/api/calendar/billing.ics?token=${token}`
    : "";
  // Persönlicher Feed läuft über den Personen-Token, nicht den globalen Token.
  const personalUrl = origin && personalToken
    ? `${origin}/api/calendar/person.ics?token=${personalToken}`
    : "";

  function copy(url: string, kind: string) {
    if (!url) return;
    navigator.clipboard.writeText(url).then(
      () => {
        setCopied(kind);
        setTimeout(() => setCopied(null), 1500);
        toast.success("Link kopiert");
      },
      () => toast.error("Konnte nicht kopieren")
    );
  }

  function handleRegenerate() {
    if (
      !confirm(
        "Token neu generieren? Bestehende Abonnements brechen und müssen neu eingerichtet werden."
      )
    )
      return;
    startTransition(async () => {
      try {
        const fresh = await regenerateCalendarToken();
        setToken(fresh);
        toast.success("Neuer Token aktiv");
      } catch (e) {
        toastError(e, "Speichern");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Planungszeiträume</Label>
        <div className="flex gap-2">
          <Input
            value={planningUrl}
            readOnly
            className="font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => copy(planningUrl, "planning")}
            title="URL kopieren"
          >
            {copied === "planning" ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Berechnungszeiträume</Label>
        <div className="flex gap-2">
          <Input
            value={billingUrl}
            readOnly
            className="font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => copy(billingUrl, "billing")}
            title="URL kopieren"
          >
            {copied === "billing" ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label>Personalplanung (persönlich)</Label>
          <InfoHint text="Zeigt nur deine eigenen Einsätze. Der Link läuft über deinen persönlichen Token — neu generieren auf deiner Seite im Personalstamm." />
        </div>
        {personalUrl ? (
          <>
            <div className="flex gap-2">
              <Input
                value={personalUrl}
                readOnly
                className="font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => copy(personalUrl, "personal")}
                title="URL kopieren"
              >
                {copied === "personal" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Dein Account ist mit keiner Person im Personalstamm verknüpft.
            Sobald die Verknüpfung gesetzt ist (Personalstamm → Person
            bearbeiten → Cratel-Account), erscheint hier dein persönliches
            Einsatz-Abo.
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={handleRegenerate}
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Token neu generieren
        </Button>
      </div>
    </div>
  );
}
