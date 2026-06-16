"use client";

import { useEffect, useState } from "react";
import { QrCodeDisplay } from "@/app/(app)/devices/[id]/qr-display";
import { buildQrUrl } from "@/lib/qr-code";

/**
 * Zeigt den QR-Code für eine Packeinheit an. Inhalt: kompakte URL mit shortId:
 *   https://<domain>/q/<8-Zeichen-Token>
 * Siehe DeviceQr für Details zur Optimierung.
 */
export function PackUnitQr({ shortId, name }: { shortId: string; name: string }) {
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
