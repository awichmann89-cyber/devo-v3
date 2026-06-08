"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Circle,
  Loader2,
  Package,
  Trash2,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { groupItemsByCategory } from "@/lib/category-tree";
import { toast } from "sonner";
import {
  submitScanWithToken,
  resetPackingScansWithToken,
  deletePackingScanWithToken,
  type ScanResult,
} from "../../(app)/projects/[id]/scan-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type PackItem = {
  kind: "PACK";
  key: string;
  packUnitId: string;
  code: string;
  name: string;
  required: number;
  scanned: number;
  scannedRaw: number;
  categoryId: string | null;
};
type LooseItem = {
  kind: "LOOSE";
  key: string;
  deviceId: string;
  name: string;
  required: number;
  scanned: number;
  scannedRaw: number;
  categoryId: string | null;
};
type Item = PackItem | LooseItem;

type CategoryLite = { id: string; name: string; parentId: string | null };

type RecentScan = {
  id: string;
  scannedAt: string;
  scannedCode: string;
  label: string;
  kind: "PACK_UNIT" | "DEVICE";
};

interface Props {
  token: string;
  projectName: string;
  customerName: string | null;
  items: Item[];
  categories: CategoryLite[];
  recentScans: RecentScan[];
}

export function ScanClient({
  token,
  projectName,
  customerName,
  items,
  categories,
  recentScans,
}: Props) {
  const [manual, setManual] = useState("");
  const [pending, startTransition] = useTransition();
  const [confirmReset, setConfirmReset] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // html5-qrcode Scanner-Instance. Lib übernimmt video-element + Decoding intern.
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);

  const totalRequired = items.reduce((s, it) => s + it.required, 0);
  const totalScanned = items.reduce((s, it) => s + it.scanned, 0);
  const done = totalScanned >= totalRequired && totalRequired > 0;

  async function handleScan(code: string) {
    const clean = code.trim();
    if (!clean) return;

    // Dedup: gleichen Code nicht innerhalb von 2s nochmal
    const now = Date.now();
    if (lastScanRef.current && lastScanRef.current.code === clean && now - lastScanRef.current.at < 2000) {
      return;
    }
    lastScanRef.current = { code: clean, at: now };

    startTransition(async () => {
      const res: ScanResult = await submitScanWithToken(token, clean);
      if (!res.ok) {
        const msg =
          res.reason === "UNKNOWN_CODE"
            ? `Code unbekannt: ${clean}`
            : res.reason === "NOT_IN_PROJECT"
              ? `Nicht zu diesem Projekt gebucht: ${clean}`
              : "Ungültiger Token";
        toast.error(msg);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate?.(200);
        }
        return;
      }
      const label =
        res.kind === "PACK_UNIT"
          ? `${res.code} · ${res.name}`
          : `${res.name}${res.serial ? " · " + res.serial : ""}`;
      toast.success(label);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.(60);
      }
      setManual("");
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (manual.trim()) handleScan(manual);
  }

  // Camera-Scanner via html5-qrcode (ZXing-basiert). Läuft auf iOS Safari,
  // Chrome Android und Desktop. Lib wird dynamisch importiert, damit das
  // ~25kb Bundle nicht ungenutzt mitgeladen wird.
  async function startCamera() {
    setCameraError(null);
    try {
      const lib = await import("html5-qrcode");
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = lib;
      const scanner = new Html5Qrcode("qr-reader", {
        verbose: false,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
        ],
      });
      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.333,
        },
        (decodedText: string) => {
          void handleScan(decodedText);
        },
        () => {
          // Frame ohne erkannten Code — ignorieren (passiert mehrfach pro Sekunde)
        }
      );
      scannerRef.current = scanner;
      setCameraOn(true);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Kamera-Zugriff nicht möglich";
      setCameraError(msg);
    }
  }

  async function stopCamera() {
    try {
      await scannerRef.current?.stop();
      scannerRef.current?.clear();
    } catch {
      // ignore — Scanner war evtl. nicht gestartet
    }
    scannerRef.current = null;
    setCameraOn(false);
  }

  useEffect(() => {
    return () => {
      void stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleReset() {
    setConfirmReset(false);
    startTransition(async () => {
      const r = await resetPackingScansWithToken(token);
      if (r.ok) toast.success("Alle Scans zurückgesetzt");
      else toast.error("Konnte nicht zurücksetzen");
    });
  }

  function handleDelete(scanId: string) {
    startTransition(async () => {
      await deletePackingScanWithToken(token, scanId);
    });
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:py-8 space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{projectName}</h1>
        {customerName && (
          <p className="text-sm text-muted-foreground">{customerName}</p>
        )}
      </div>

      {/* Fortschritt */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Fortschritt
              </div>
              <div className={cn("text-2xl font-bold tabular-nums", done && "text-emerald-600")}>
                {totalScanned} / {totalRequired}
              </div>
            </div>
            {done ? (
              <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> Komplett
              </Badge>
            ) : (
              <Badge variant="outline">
                <Package className="h-4 w-4" /> {totalRequired - totalScanned} offen
              </Badge>
            )}
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full transition-all",
                done ? "bg-emerald-600" : "bg-primary"
              )}
              style={{
                width: totalRequired > 0
                  ? `${Math.min(100, (totalScanned / totalRequired) * 100)}%`
                  : "0%",
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Scanner */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Code scannen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Container für html5-qrcode — Lib injiziert hier ein <video>-Element.
              Bleibt immer im DOM (Lib braucht den Mount-Point beim Start), wird
              nur visuell ausgeblendet wenn Kamera aus. */}
          <div
            id="qr-reader"
            className={cn(
              "overflow-hidden rounded-md bg-black [&_video]:w-full [&_video]:aspect-[4/3] [&_video]:object-cover",
              !cameraOn && "hidden"
            )}
          />
          {cameraOn ? (
            <Button variant="outline" className="w-full" onClick={stopCamera}>
              <CameraOff className="h-4 w-4" /> Kamera stoppen
            </Button>
          ) : (
            <Button onClick={startCamera} className="w-full" disabled={pending}>
              <Camera className="h-4 w-4" /> Kamera öffnen
            </Button>
          )}

          {cameraError && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{cameraError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              placeholder="Code manuell eingeben …"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={pending}
            />
            <Button type="submit" disabled={pending || !manual.trim()}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "OK"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Packlisten-Items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Packliste</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Keine Geräte gebucht
            </p>
          ) : (
            <ul className="divide-y">
              {groupItemsByCategory(items, categories).map((group) => (
                <Fragment key={group.key}>
                  <li
                    className="sticky top-0 z-10 flex items-center gap-2 bg-muted/80 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur"
                    style={{ paddingLeft: `${0.75 + group.depth * 1.5}rem` }}
                  >
                    <span>{group.name}</span>
                    {group.items.length > 0 && (
                      <span className="ml-auto text-[10px] font-normal normal-case text-muted-foreground/80">
                        {group.items.length}
                      </span>
                    )}
                  </li>
                  {group.items.map((it) => {
                    const complete = it.scanned >= it.required;
                    return (
                      <li
                        key={it.key}
                        className={cn(
                          "flex items-center gap-3 py-2.5 pr-4",
                          complete && "bg-emerald-50"
                        )}
                        style={{ paddingLeft: `${1.5 + (group.depth + 1) * 1.5}rem` }}
                      >
                        {complete ? (
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                        ) : (
                          <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {it.kind === "PACK" ? (
                              <>
                                <span className="text-muted-foreground">{it.code}</span> · {it.name}
                              </>
                            ) : (
                              it.name
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {it.kind === "PACK" ? "Packeinheit" : "Lose"}
                          </div>
                        </div>
                        <div
                          className={cn(
                            "tabular-nums text-sm font-semibold",
                            complete ? "text-emerald-700" : "text-foreground"
                          )}
                        >
                          {it.scanned} / {it.required}
                        </div>
                      </li>
                    );
                  })}
                </Fragment>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Letzte Scans */}
      {recentScans.length > 0 && (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Letzte Scans</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmReset(true)}
              disabled={pending}
            >
              <RotateCcw className="h-4 w-4" /> Zurücksetzen
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {recentScans.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{s.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(s.scannedAt).toLocaleTimeString("de-DE", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                      {" · "}
                      <span className="font-mono">{s.scannedCode}</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(s.id)}
                    disabled={pending}
                    title="Diesen Scan löschen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Alle Scans zurücksetzen?"
        description="Damit beginnst du den Pack-Vorgang von vorne. Die Packliste selbst bleibt unverändert."
        confirmLabel="Zurücksetzen"
        onConfirm={handleReset}
        variant="destructive"
      />
    </main>);
}
