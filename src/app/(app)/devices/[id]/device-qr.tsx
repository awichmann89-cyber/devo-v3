"use client";

import { useEffect, useState } from "react";
import { QrCodeDisplay } from "./qr-display";

export function DeviceQr({ id, name }: { id: string; name: string }) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    setUrl(`${window.location.origin}/public/devices/${id}`);
  }, [id]);

  if (!url) return <div className="h-[220px] w-[220px] animate-pulse bg-muted" />;

  return (
    <>
      <QrCodeDisplay text={url} label={name} />
      <p className="text-xs text-muted-foreground text-center break-all">{url}</p>
    </>
  );
}
