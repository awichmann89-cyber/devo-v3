"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle, Eraser } from "lucide-react";
import { acceptQuote, type AcceptQuoteResult } from "./acceptance-actions";

/**
 * Annahme-Formular für ein Angebot. Pflichtfelder: Name + E-Mail + Signatur
 * + Häkchen. An die E-Mail-Adresse geht nach der Annahme automatisch eine
 * Bestätigung (ebenso an den Projekt-Zuständigen), siehe acceptQuote.
 *
 * Canvas-Signatur: nutzt Pointer-Events (deckt Maus + Touch + Pen ab).
 * Wir zeichnen mit weichen Linien, exportieren als PNG-DataURL und schicken
 * sie zusammen mit dem Namen an die acceptQuote-Server-Action.
 *
 * Nach erfolgreicher Annahme wird `window.location.reload()` aufgerufen,
 * damit die Public-Page neu rendert und den "Angenommen"-Zustand anzeigt
 * (inkl. der gespeicherten Signatur).
 */
export function AcceptanceForm({
  token,
  quoteNumber,
}: {
  token: string;
  quoteNumber: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Canvas-Refs und Zustand
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [hasSignature, setHasSignature] = useState(false);

  // Canvas auf physische Pixel skalieren (für Retina/HiDPI scharfe Linien).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 2;
    }
  }, []);

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);
    isDrawing.current = true;
    lastPoint.current = getPos(e);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e);
    if (lastPoint.current) {
      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
    lastPoint.current = pos;
    if (!hasSignature) setHasSignature(true);
  }

  function handlePointerUp() {
    isDrawing.current = false;
    lastPoint.current = null;
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || name.trim().length < 2) {
      setError("Bitte geben Sie Ihren vollständigen Namen an.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Bitte geben Sie eine gültige E-Mail-Adresse an.");
      return;
    }
    if (!hasSignature) {
      setError("Bitte zeichnen Sie Ihre Unterschrift im Feld.");
      return;
    }
    if (!agreementChecked) {
      setError("Bitte bestätigen Sie die Annahme über das Häkchen.");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const signaturePng = canvas.toDataURL("image/png");

    startTransition(async () => {
      try {
        const result: AcceptQuoteResult = await acceptQuote({
          token,
          name: name.trim(),
          email: email.trim(),
          signaturePng,
          agreementChecked,
        });
        if (!result.ok) {
          const messages: Record<typeof result.reason, string> = {
            UNKNOWN_TOKEN: "Dieses Angebot wurde nicht gefunden.",
            ALREADY_ACCEPTED: "Dieses Angebot wurde bereits angenommen.",
            EXPIRED: "Dieses Angebot ist abgelaufen.",
            SUPERSEDED:
              "Dieses Angebot wurde durch eine neue Version ersetzt. Bitte Seite neu laden.",
            INVALID_NAME: "Bitte geben Sie einen gültigen Namen an.",
            INVALID_EMAIL: "Bitte geben Sie eine gültige E-Mail-Adresse an.",
            INVALID_SIGNATURE: "Die Unterschrift konnte nicht verarbeitet werden.",
            AGREEMENT_REQUIRED: "Bitte das Häkchen zur Annahme setzen.",
          };
          setError(messages[result.reason] ?? "Ein Fehler ist aufgetreten.");
          return;
        }
        // Erfolg → Seite neu laden, damit der angenommene Zustand erscheint.
        window.location.reload();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Fehler beim Senden",
        );
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-success" />
          Angebot annehmen
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Ihr Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Max Mustermann"
              disabled={pending}
              style={{ fontSize: 16 }}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="email">Ihre E-Mail-Adresse *</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="max@beispiel.de"
              disabled={pending}
              style={{ fontSize: 16 }}
            />
            <p className="text-xs text-muted-foreground">
              An diese Adresse senden wir Ihnen die Annahme-Bestätigung.
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Unterschrift *</Label>
              {hasSignature && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={clearSignature}
                  className="h-7 gap-1 text-xs text-muted-foreground"
                >
                  <Eraser className="h-3.5 w-3.5" /> Löschen
                </Button>
              )}
            </div>
            <div className="rounded-md border bg-white">
              <canvas
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="block w-full touch-none rounded-md"
                style={{ height: 160 }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Zeichnen Sie Ihre Unterschrift mit Maus, Finger oder Stift.
            </p>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={agreementChecked}
              onChange={(e) => setAgreementChecked(e.target.checked)}
              disabled={pending}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              Ich nehme das Angebot <strong>{quoteNumber}</strong> hiermit
              verbindlich an.
            </span>
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={pending} className="bg-success hover:bg-success">
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Angebot verbindlich annehmen
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
