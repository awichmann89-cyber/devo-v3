"use client";

import { QrCodeDisplay } from "./qr-display";
import { buildShortQrPayload } from "@/lib/qr-code";

/**
 * Zeigt den QR-Code für ein Gerät an. Inhalt: kompakter Kurzcode `DV<id>`
 * (~27 Zeichen) statt voller URL — resultiert in deutlich kleinerer
 * QR-Komplexität (Version 2 statt 5), wichtig für gute Scanbarkeit auf
 * kleinen physischen Stickern.
 */
export function DeviceQr({ id, name }: { id: string; name: string }) {
  const payload = buildShortQrPayload("DV", id);

  return (
    <>
      <QrCodeDisplay text={payload} label={name} />
      <p className="text-xs text-muted-foreground text-center break-all font-mono">
        {payload}
      </p>
    </>
  );
}
