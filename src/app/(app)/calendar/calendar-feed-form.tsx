"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, RefreshCw, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { regenerateCalendarToken } from "../settings/settings-actions";

export function CalendarFeedForm({ initialToken }: { initialToken: string }) {
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
        toast.error(e instanceof Error ? e.message : "Fehler");
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

      <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2">
        <p className="font-medium">So abonnierst du den Kalender in Google:</p>
        <ol className="ml-5 list-decimal space-y-1 text-xs text-muted-foreground">
          <li>
            Google Kalender öffnen → links bei „Weitere Kalender" auf das + klicken
          </li>
          <li>„Über URL" auswählen, eine der oberen URLs einfügen</li>
          <li>„Kalender hinzufügen" — der Kalender erscheint und aktualisiert sich automatisch</li>
        </ol>
        <p className="text-xs text-muted-foreground">
          Google synchronisiert ICS-Feeds typischerweise alle paar Stunden, nicht in Echtzeit.
        </p>
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
