"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export function QrCodeDisplay({ text, label }: { text: string; label?: string }) {
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    QRCode.toDataURL(text, { width: 220, margin: 1 }).then(setDataUrl);
  }, [text]);

  function download() {
    const a = document.createElement("a");
    a.href = dataUrl;
    const safeName = (label ?? text).replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 40);
    a.download = `qr-${safeName}.png`;
    a.click();
  }

  if (!dataUrl) return <div className="h-[220px] w-[220px] animate-pulse bg-muted" />;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dataUrl} alt={`QR Code für ${label ?? text}`} className="rounded border" />
      <Button variant="outline" size="sm" onClick={download}>
        <Download className="h-4 w-4" /> PNG herunterladen
      </Button>
    </>
  );
}
