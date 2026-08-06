"use client";

import { useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, RefreshCw, Loader2, Check, Link2 } from "lucide-react";
import { toast } from "sonner";
import { regeneratePersonToken } from "../actions";
import { toastError } from "@/lib/toast";

/**
 * Persönliche Links einer Person: ICS-Kalender-Abo + Zeiterfassungs-Seite.
 * Beide laufen über DENSELBEN Token — Regenerieren invalidiert beide Links.
 */
export function PersonLinksCard({
  personId,
  initialToken,
}: {
  personId: string;
  initialToken: string;
}) {
  const [token, setToken] = useState(initialToken);
  const [origin, setOrigin] = useState("");
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const calendarUrl =
    origin && token ? `${origin}/api/calendar/person.ics?token=${token}` : "";
  const einsatzUrl = origin && token ? `${origin}/einsatz/${token}` : "";

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
        "Token neu generieren? Kalender-Abo UND Zeiterfassungs-Link werden ungültig und müssen neu verteilt werden."
      )
    )
      return;
    startTransition(async () => {
      try {
        const fresh = await regeneratePersonToken(personId);
        setToken(fresh);
        toast.success("Neuer Token aktiv");
      } catch (e) {
        toastError(e, "Speichern");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-4 w-4" /> Persönliche Links
          <InfoHint text="Beide Links an die Person weitergeben: Kalender-Abo zeigt die Einsätze, die Zeiterfassungs-Seite dient dem Nachtragen der Ist-Stunden. Kein Login nötig — der Link ist der Zugang." />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Kalender-Abo (ICS)</Label>
          <div className="flex gap-2">
            <Input
              value={calendarUrl}
              readOnly
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => copy(calendarUrl, "calendar")}
              title="URL kopieren"
            >
              {copied === "calendar" ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Zeiterfassung</Label>
          <div className="flex gap-2">
            <Input
              value={einsatzUrl}
              readOnly
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => copy(einsatzUrl, "einsatz")}
              title="URL kopieren"
            >
              {copied === "einsatz" ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
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
      </CardContent>
    </Card>
  );
}
