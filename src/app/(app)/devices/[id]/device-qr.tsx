"use client";

import { useEffect, useState } from "react";
import { QrCodeDisplay } from "./qr-display";
import { buildQrUrl } from "@/lib/qr-code";

/**
 * Zeigt den QR-Code für ein Gerät an. Inhalt: kompakte URL mit shortId:
 *   https://<domain>/q/<8-Zeichen-Token>
 *
 * Echte URL → mit iOS-Kamera direkt scannbar. Der Server-Redirect bei /q/
 * leitet auf die Detail-Seite weiter. Die kurze shortId (statt der vollen
 * 25-Zeichen cuid) bringt den QR-Code auf Version 2 (25×25 Module) — bei
 * 1,5 cm Druck sind das 0,60 mm pro Modul, deutlich besser scanbar.
 */
export function DeviceQr({ shortId, name }: { shortId: string; name: string }) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    setUrl(buildQrUrl(window.location.origin, shortId));
  }, [shortId]);

  if (!url) return <div className="h-[220px] w-[220px] animate-pulse bg-muted" />;

  return (
    <>
      <QrCodeDisplay text={url} label={name} />
      <p className="text-xs text-muted-foreground text-center break-all">{url}</p>
    </>
  );
}
