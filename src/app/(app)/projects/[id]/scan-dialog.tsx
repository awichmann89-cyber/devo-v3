"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { QrCode, ExternalLink, RotateCw, Copy, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import {
  getOrCreatePackToken,
  regeneratePackToken,
} from "./scan-actions";

interface Props {
  projectId: string;
  hasAssignments: boolean;
  packedCount: number;
  totalCount: number;
}

export function ScanDialog({ projectId, hasAssignments, packedCount, totalCount }: Props) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [origin, setOrigin] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  // Token holen sobald Dialog öffnet
  useEffect(() => {
    if (!open || token) return;
    startTransition(async () => {
      try {
        const t = await getOrCreatePackToken(projectId);
        setToken(t);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Konnte Token nicht laden");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const scanUrl = token && origin ? `${origin}/scan/${token}` : "";

  // QR-Code generieren wenn URL bekannt
  useEffect(() => {
    if (!scanUrl) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(scanUrl, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [scanUrl]);

  function handleRegenerate() {
    startTransition(async () => {
      const t = await regeneratePackToken(projectId);
      setToken(t);
      toast.success("Neuer Link erzeugt");
    });
  }

  async function handleCopy() {
    if (!scanUrl) return;
    try {
      await navigator.clipboard.writeText(scanUrl);
      toast.success("Link kopiert");
    } catch {
      toast.error("Konnte nicht kopieren");
    }
  }

  const done = totalCount > 0 && packedCount >= totalCount;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={!hasAssignments}
        title={hasAssignments ? "Per Handy scannen" : "Erst Geräte buchen"}
      >
        <QrCode className="h-4 w-4" /> Digital Packen
        {totalCount > 0 && (
          <Badge
            variant={done ? "default" : "secondary"}
            className={done ? "ml-1 bg-success hover:bg-success" : "ml-1"}
          >
            {packedCount}/{totalCount}
          </Badge>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" /> Digital Packen
            </DialogTitle>
            <DialogDescription>
              QR-Code mit dem Handy scannen. Auf der Seite kannst du dann Packeinheiten- und
              Geräte-Codes scannen — sie werden in der Packliste abgehakt.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3 py-2">
            {pending && !qrDataUrl ? (
              <div className="flex h-[320px] w-[320px] items-center justify-center rounded-md border bg-muted">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt="QR-Code zur Scan-Seite"
                className="h-[320px] w-[320px] rounded-md border bg-white"
              />
            ) : (
              <div className="flex h-[320px] w-[320px] items-center justify-center rounded-md border bg-muted text-sm text-muted-foreground">
                Kein QR-Code verfügbar
              </div>
            )}

            {totalCount > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Fortschritt:</span>
                <span className="font-semibold tabular-nums">
                  {packedCount} / {totalCount}
                </span>
                {done && (
                  <Badge className="bg-success hover:bg-success">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Komplett
                  </Badge>
                )}
              </div>
            )}

            <div className="flex w-full items-center gap-2">
              <Input
                value={scanUrl}
                readOnly
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={handleCopy}
                title="Kopieren"
                disabled={!scanUrl}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleRegenerate}
              disabled={pending}
            >
              <RotateCw className="h-4 w-4" /> Neuen Link erzeugen
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={() => {
                if (scanUrl) window.open(scanUrl, "_blank");
              }}
              disabled={!scanUrl}
            >
              <ExternalLink className="h-4 w-4" /> Im Browser öffnen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
