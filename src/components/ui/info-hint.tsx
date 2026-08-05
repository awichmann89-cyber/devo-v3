"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { Info } from "lucide-react";

/**
 * Kleines graues Info-Icon; zeigt den Hilfetext beim Hovern und beim
 * Klicken/Tippen (Touch!) als Popover an. Hält Titel und Formulare sauber,
 * wenn die Beschreibung nicht dauerhaft sichtbar sein soll.
 */
export function InfoHint({ text }: { text: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Info"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className="inline-flex shrink-0 align-middle text-muted-foreground/60 transition-colors hover:text-muted-foreground"
        >
          <Info className="h-4 w-4" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={6}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-50 max-w-xs rounded-md border bg-popover px-3 py-2 text-left text-xs font-normal leading-relaxed text-popover-foreground shadow-md"
        >
          {text}
          <Popover.Arrow className="fill-border" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
