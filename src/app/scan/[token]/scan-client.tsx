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
  // Visuelles Feedback im Kamera-Bild: kurz nach erfolgreichem Scan zeigt sich
  // ein grüner Haken, der nach ~1.5s wieder verschwindet, damit man weiß,
  // dass der Code erfasst wurde, ohne dass der Scan-Modus unterbrochen wird.
  const [scanSuccess, setScanSuccess] = useState(false);
  const scanSuccessTimerRef = useRef<number | null>(null);

  // html5-qrcode Scanner-Instance. Lib übernimmt video-element + Decoding intern.
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  // Zweiter Decoder-Loop für invertierte QR-Codes (weiß auf schwarz). html5-qrcode
  // erkennt nur normale Codes, jsQR macht parallel den invertierten Pass.
  const invertedLoopRef = useRef<number | null>(null);

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
      // Grüner Haken im Kamera-Bild kurz einblenden, dann ausblenden, damit
      // weiter gescannt werden kann.
      setScanSuccess(true);
      if (scanSuccessTimerRef.current !== null) {
        window.clearTimeout(scanSuccessTimerRef.current);
      }
      scanSuccessTimerRef.current = window.setTimeout(() => {
        setScanSuccess(false);
        scanSuccessTimerRef.current = null;
      }, 1500);
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
        // Maximale Auflösung anfordern — kleine ausgedruckte QR-Codes brauchen
        // genug Pixel pro Modul (≥3) um zuverlässig dekodiert zu werden.
        // `ideal` heißt: der Browser nimmt diese Werte wenn möglich, fällt
        // sonst auf die nächstmögliche Auflösung zurück (z.B. 1280×720).
        // `focusMode: continuous` hält den Bereich vor der Linse scharf,
        // wichtig bei sich bewegenden Boxen.
        {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          // @ts-expect-error — focusMode ist nicht in allen Browser-Typings,
          // wird aber von iOS Safari und Android Chrome unterstützt.
          focusMode: "continuous",
        },
        {
          fps: 15,
          // Kein qrbox setzen — html5-qrcode durchsucht so den GESAMTEN Frame
          // statt nur ein zentriertes Quadrat. Das macht die Erfassung
          // deutlich zuverlässiger, gerade bei kleinen ausgedruckten Codes.
          aspectRatio: 1.0,
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

      // Zweiter Decoder-Pfad: invertierte QR-Codes (weiß auf schwarz).
      // html5-qrcode (ZXing) probiert von Haus aus keine Color-Inversion,
      // deshalb läuft hier jsQR mit `inversionAttempts: "onlyInvert"` parallel
      // auf demselben Video-Element. Wer zuerst was findet, gewinnt — die
      // Dedup-Logik in handleScan verhindert Doppelauslösungen.
      startInvertedLoop();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Kamera-Zugriff nicht möglich";
      setCameraError(msg);
    }
  }

  /**
   * Inverter-Loop: greift das von html5-qrcode angelegte <video>-Element ab,
   * zeichnet alle ~150 ms einen Frame auf ein Offscreen-Canvas, und lässt
   * jsQR mit `inversionAttempts: "onlyInvert"` darauf laufen. Trifft jsQR
   * einen weißen-auf-schwarz QR-Code, geht das Ergebnis durch dieselbe
   * handleScan-Pipeline wie der normale Pfad.
   */
  function startInvertedLoop() {
    if (invertedLoopRef.current !== null) return; // schon aktiv
    // jsQR ist eine reine CPU-Library — wir laden sie dynamisch, damit das
    // Bundle nur bei tatsächlichem Scanner-Aufruf wächst.
    let jsQR: typeof import("jsqr").default | null = null;
    void import("jsqr").then((mod) => {
      jsQR = mod.default;
    });

    const offscreen = document.createElement("canvas");
    const ctx = offscreen.getContext("2d", { willReadFrequently: true });

    const tick = () => {
      const video = document.querySelector<HTMLVideoElement>("#qr-reader video");
      if (!video || !ctx || !jsQR || video.readyState < 2) {
        return;
      }
      // Native Frame-Auflösung verwenden — kein Downsampling. Kleine
      // ausgedruckte QR-Codes brauchen genug Pixel pro Modul; wenn wir auf
      // 640×480 runterrechnen, fallen Codes < ~3 cm aus 30 cm Abstand
      // unter die Decoder-Schwelle.
      const w = video.videoWidth || 0;
      const h = video.videoHeight || 0;
      if (w === 0 || h === 0) return;
      if (offscreen.width !== w) offscreen.width = w;
      if (offscreen.height !== h) offscreen.height = h;
      try {
        ctx.drawImage(video, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const result = jsQR(imageData.data, w, h, { inversionAttempts: "onlyInvert" });
        if (result?.data) {
          void handleScan(result.data);
        }
      } catch {
        // CORS-/Frame-Probleme ignorieren — der nächste Tick versucht's neu.
      }
    };

    // 250 ms statt 150 ms — bei voller Auflösung ist ein jsQR-Pass deutlich
    // teurer, alle 4 Frames reicht für die Inversion locker.
    invertedLoopRef.current = window.setInterval(tick, 250);
  }

  function stopInvertedLoop() {
    if (invertedLoopRef.current !== null) {
      window.clearInterval(invertedLoopRef.current);
      invertedLoopRef.current = null;
    }
  }

  async function stopCamera() {
    stopInvertedLoop();
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
      if (scanSuccessTimerRef.current !== null) {
        window.clearTimeout(scanSuccessTimerRef.current);
        scanSuccessTimerRef.current = null;
      }
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
          {/* Kamera-Vorschau via html5-qrcode.
              Quadratisch: volle Breite der Card, Höhe = Breite (aspect-square).
              Das Video wird via object-cover beschnitten, damit kein
              Letterbox-Rahmen erscheint. Gescannt wird im gesamten Frame. */}
          <div
            className={cn(
              "relative mx-auto w-full aspect-square overflow-hidden rounded-md border bg-black",
              cameraOn ? "block" : "hidden"
            )}
          >
            <div
              id="qr-reader"
              className={cn(
                // Lib-Internals beruhigen:
                "[&>div]:!border-0 [&>div]:!p-0",
                "[&_button]:!hidden",
                "[&_select]:!hidden",
                // Video full-fill und beschneidend einbetten:
                "h-full w-full",
                "[&_video]:!block [&_video]:!w-full [&_video]:!h-full [&_video]:!object-cover"
              )}
            />
            {/* Scan-Status-Overlay
                Default („Wird gescannt"): dezente animierte Eckenmarkierung,
                signalisiert dass die Kamera aktiv durchsucht.
                Bei erfolgreichem Scan: großer grüner Haken, blendet nach ~1.5s
                wieder aus, damit der nächste Code weiter erfasst werden kann. */}
            <div className="pointer-events-none absolute inset-0">
              {scanSuccess ? (
                <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/30 backdrop-blur-[1px] transition-opacity">
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50">
                    <CheckCircle2 className="h-14 w-14 text-white" strokeWidth={3} />
                  </div>
                </div>
              ) : (
                <>
                  {/* Vier Ecken-Marken — zeigen den Scanbereich an, ohne die
                      Mitte zu beschneiden (es wird ja eh überall gesucht). */}
                  <div className="absolute left-3 top-3 h-6 w-6 border-l-2 border-t-2 border-white/70" />
                  <div className="absolute right-3 top-3 h-6 w-6 border-r-2 border-t-2 border-white/70" />
                  <div className="absolute bottom-3 left-3 h-6 w-6 border-b-2 border-l-2 border-white/70" />
                  <div className="absolute bottom-3 right-3 h-6 w-6 border-b-2 border-r-2 border-white/70" />
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-black/50 px-2 py-0.5 text-[11px] font-medium text-white">
                    Wird gescannt…
                  </div>
                </>
              )}
            </div>
          </div>
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
