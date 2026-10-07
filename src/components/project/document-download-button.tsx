"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Download-Button für ein Projekt-Dokument (Packliste, Lieferschein,
 * Einsatzplan).
 *
 * `Button asChild` rendert einen `<a>` — `disabled` greift an einem Anchor
 * nicht, deshalb zusätzlich `aria-disabled` und ein abgefangener Klick.
 */
export function DocumentDownloadButton({
  href,
  label,
  title,
  enabled,
  disabledTitle,
  variant = "default",
}: {
  href: string;
  label: string;
  title: string;
  enabled: boolean;
  /** Tooltip, solange es noch nichts zu drucken gibt. */
  disabledTitle: string;
  variant?: "default" | "outline";
}) {
  return (
    <Button asChild size="sm" variant={variant} disabled={!enabled}>
      <a
        href={href}
        download
        rel="noopener"
        title={enabled ? title : disabledTitle}
        aria-disabled={!enabled}
        onClick={(e) => {
          if (!enabled) e.preventDefault();
        }}
      >
        <Download className="h-4 w-4" /> {label}
      </a>
    </Button>
  );
}
