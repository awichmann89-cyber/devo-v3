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
  Keyboard,
  Loader2,
  Minus,
  Package,
  Plus,
  Trash2,
  RotateCcw,
  AlertTriangle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { groupItemsByCategory } from "@/lib/category-tree";
import { toast } from "sonner";
import {
  submitScanWithToken,
  resetPackingScansWithToken,
  deletePackingScanWithToken,
  togglePackedCableWithToken,
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
// Kabel tragen keinen QR-Code — sie werden über +/- manuell abgehakt.
type CableItem = {
  kind: "CABLE";
  key: string;
  cableId: string;
  name: string;
  // Länge + Steckerenden ("10 m · XLR male → XLR female")
  spec: string | null;
  required: number;
  scanned: number;
  scannedRaw: number;
  categoryId: string | null;
};
type Item = PackItem | LooseItem | CableItem;

type CategoryLite = { id: string; name: string; parentId: string | null };

type RecentScan = {
  id: string;
  scannedAt: string;
  scannedCode: string;
  label: string;
  kind: "PACK_UNIT" | "DEVICE" | "CABLE";
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
  // Default: Manual-Input ist NICHT sichtbar. iOS Safari fokussiert sonst gerne
  // ungewollt ins Textfeld und zoomt rein (Schriftgrößen-Trigger). Nur wenn
  // User explizit auf "Code manuell eingeben" tippt, blenden wir das Feld ein.
  const [showManualInput, setShowManualInput] = useState(false);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [confirmReset, setConfirmReset] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  // Visuelles Feedback im Kamera-Bild: kurz nach erfolgreichem Scan zeigt sich
  // ein grüner Haken, der nach ~1.5s wieder verschwindet, damit man weiß,
  // dass der Code erfasst wurde, ohne dass der Scan-Modus unterbrochen wird.
  const [scanSuccess, setScanSuccess] = useState(false);
  const scanSuccessTimerRef = useRef<number | null>(null);

  // nimiq/qr-scanner Scanner-Instance — wraps Cosmo Wolfe's jsQR port mit
  // diversen Verbesserungen: läuft im WebWorker (UI bleibt smooth), kann
  // normale UND invertierte QR-Codes in einem Pass dekodieren, fällt auf den
  // nativen BarcodeDetector zurück wenn der Browser ihn hat, und hat laut
  // Benchmarks eine 2-3× höhere Detection-Rate als jsQR/ZXing alleine.
  // Den konkreten Typ holen wir über typeof, damit der dynamische Import
  // im Bundle nicht groß auftaucht.
  const scannerRef = useRef<import("qr-scanner").default | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
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

  // Camera-Scanner via nimiq/qr-scanner. Lib läuft im WebWorker (UI bleibt
  // smooth), unterstützt Inversion (weiß-auf-schwarz) eingebaut, hat einen
  // Auto-Fallback auf die native BarcodeDetector-API wo verfügbar, und wird
  // dynamisch importiert damit das Bundle nicht unnötig wächst.
  async function startCamera() {
    setCameraError(null);
    const video = videoRef.current;
    if (!video) {
      setCameraError("Video-Element nicht bereit");
      return;
    }
    try {
      // iOS Safari braucht diese Attribute, sonst öffnet das Video im
      // Full-Screen-Modus statt inline im DOM. Vor dem Scanner-Start setzen.
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
      video.setAttribute("muted", "true");
      video.setAttribute("autoplay", "true");

      const { default: QrScanner } = await import("qr-scanner");
      const scanner = new QrScanner(
        video,
        (result) => {
          // Neuer Result-Modus liefert { data, cornerPoints }; uns reicht
          // der Daten-String.
          void handleScan(result.data);
        },
        {
          preferredCamera: "environment",
          // Eingebaute Inversion: nimiq scannt pro Frame beide Varianten
          // (normaler Code auf hellem Grund UND invertierter Code auf
          // dunklem Grund). Ersetzt unseren früheren parallelen jsQR-Loop.
          // `setInversionMode` wird unten gesetzt, der Konstruktor selbst
          // hat keine Option dafür.
          maxScansPerSecond: 15,
          // Scan-Region: deckt fast die ganze Vorschau ab, wird intern
          // auf 600×600 runterskaliert für Decoder-Performance. Das ist
          // mehr als der nimiq-Default (400×400) — wichtig für kleine
          // QR-Codes, da bei 720p-Video → 600×600-Decoder-Pass ~6 Pixel
          // pro Modul bei 1,5 cm Code aus 15 cm Distanz bleiben.
          calculateScanRegion: (v) => {
            const vw = v.videoWidth || 1280;
            const vh = v.videoHeight || 720;
            const minEdge = Math.min(vw, vh);
            const size = Math.floor(minEdge * 0.9);
            const x = Math.floor((vw - size) / 2);
            const y = Math.floor((vh - size) / 2);
            return {
              x,
              y,
              width: size,
              height: size,
              downScaledWidth: 600,
              downScaledHeight: 600,
            };
          },
          // Unser eigenes Overlay (grüner Haken etc.) zeichnen wir selbst,
          // damit der gestylte Glas-Effekt erhalten bleibt.
          highlightScanRegion: false,
          highlightCodeOutline: false,
          returnDetailedScanResult: true,
        },
      );

      // Inversion-Mode auf "both" — Schlüssel-Feature der Library, scannt
      // pro Frame normal UND invertiert. Damit fallen unsere weißen QR-Codes
      // auf schwarzem Grund mit ab.
      scanner.setInversionMode("both");

      await scanner.start();
      scannerRef.current = scanner;
      setCameraOn(true);
    } catch (err: unknown) {
      console.error("[scan] startCamera fehlgeschlagen", err);
      const msg =
        err instanceof Error
          ? err.message
          : "Kamera-Zugriff nicht möglich";
      setCameraError(msg);
    }
  }

  async function stopCamera() {
    try {
      scannerRef.current?.stop();
      scannerRef.current?.destroy();
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

  // Kabel haben keinen QR-Code — hier wird pro Tipp ein Stück abgehakt bzw.
  // der letzte Haken wieder zurückgenommen.
  function handleCableToggle(cableId: string, delta: 1 | -1) {
    startTransition(async () => {
      const r = await togglePackedCableWithToken(token, cableId, delta);
      if (!r.ok) {
        toast.error(
          delta === 1
            ? "Schon vollständig abgehakt"
            : "Nichts zum Zurücknehmen"
        );
        return;
      }
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.(40);
      }
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
              <div className={cn("text-2xl font-bold tabular-nums", done && "text-success")}>
                {totalScanned} / {totalRequired}
              </div>
            </div>
            {done ? (
              <Badge variant="default" className="bg-success hover:bg-success">
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
                done ? "bg-success" : "bg-primary"
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
          {/* Kamera-Vorschau via nimiq/qr-scanner — die Lib übernimmt
              direkt das <video>-Element via videoRef. Quadratischer
              Container, Video wird mit object-cover beschnitten. */}
          <div
            className={cn(
              "relative mx-auto w-full aspect-square overflow-hidden rounded-md border bg-black",
              cameraOn ? "block" : "hidden"
            )}
          >
            <video
              ref={videoRef}
              className="block h-full w-full object-cover"
              playsInline
              muted
            />
            {/* Scan-Status-Overlay
                Default („Wird gescannt"): dezente animierte Eckenmarkierung,
                signalisiert dass die Kamera aktiv durchsucht.
                Bei erfolgreichem Scan: großer grüner Haken, blendet nach ~1.5s
                wieder aus, damit der nächste Code weiter erfasst werden kann. */}
            <div className="pointer-events-none absolute inset-0">
              {scanSuccess ? (
                <div className="absolute inset-0 flex items-center justify-center bg-success/30 backdrop-blur-[1px] transition-opacity">
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-success shadow-lg shadow-emerald-500/50">
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
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-sm text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{cameraError}</span>
            </div>
          )}

          {/* Manual-Input ist standardmäßig versteckt — sonst fokussiert
              iOS Safari gerne ungewollt ins Textfeld und zoomt das ganze
              Layout rein. Erst auf expliziten Klick blenden wir das Feld
              ein, und setzen Font auf 16 px (iOS zoomt sonst beim Fokus). */}
          {showManualInput ? (
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                ref={manualInputRef}
                placeholder="Code manuell eingeben …"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                disabled={pending}
                style={{ fontSize: 16 }}
              />
              <Button type="submit" disabled={pending || !manual.trim()}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "OK"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  setShowManualInput(false);
                  setManual("");
                }}
                title="Manuell-Eingabe schließen"
              >
                <X className="h-4 w-4" />
              </Button>
            </form>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setShowManualInput(true);
                // Im nächsten Tick fokussieren, damit das Feld schon
                // gemountet ist und der User direkt tippen kann.
                requestAnimationFrame(() => manualInputRef.current?.focus());
              }}
            >
              <Keyboard className="h-4 w-4" /> Code manuell eingeben
            </Button>
          )}
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
              Nichts gebucht
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
                          complete && "bg-success-subtle"
                        )}
                        style={{ paddingLeft: `${1.5 + (group.depth + 1) * 1.5}rem` }}
                      >
                        {complete ? (
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
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
                            {it.kind === "PACK"
                              ? "Packeinheit"
                              : it.kind === "CABLE"
                                ? // Länge + Stecker statt nur „Kabel" — beim
                                  // Packen muss der Typ eindeutig sein.
                                  it.spec
                                  ? `${it.spec} · manuell abhaken`
                                  : "Kabel · manuell abhaken"
                                : "Lose"}
                          </div>
                        </div>
                        <div
                          className={cn(
                            "tabular-nums text-sm font-semibold",
                            complete ? "text-success" : "text-foreground"
                          )}
                        >
                          {it.scanned} / {it.required}
                        </div>
                        {/* Kabel tragen keinen QR-Code → +/- statt Scan */}
                        {it.kind === "CABLE" && (
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9"
                              disabled={pending || it.scanned === 0}
                              onClick={() => handleCableToggle(it.cableId, -1)}
                              title="Einen Haken zurücknehmen"
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9"
                              disabled={pending || complete}
                              onClick={() => handleCableToggle(it.cableId, 1)}
                              title="Ein Stück abhaken"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
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
