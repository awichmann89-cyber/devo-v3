"use client";

import { QrCodeDisplay } from "@/app/(app)/devices/[id]/qr-display";
import { buildShortQrPayload } from "@/lib/qr-code";

/**
 * Zeigt den QR-Code für eine Packeinheit an. Inhalt: kompakter Kurzcode
 * `PU<id>` (~27 Zeichen) statt voller URL — siehe DeviceQr für Details.
 */
export function PackUnitQr({ id, name }: { id: string; name: string }) {
  const payload = buildShortQrPayload("PU", id);

  return (
    <>
      <QrCodeDisplay text={payload} label={name} />
      <p className="text-xs text-muted-foreground text-center break-all font-mono">
        {payload}
      </p>
    </>
  );
}
