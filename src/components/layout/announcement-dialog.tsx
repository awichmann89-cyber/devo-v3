"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Announcement } from "@/lib/announcements";
import { markAnnouncementSeen } from "@/app/(app)/announcement-actions";

/**
 * „Was ist neu"-Dialog. Zeigt die noch ungesehenen Ankündigungen nacheinander
 * (neueste zuerst). Schließen — egal ob per Button, X oder Escape — markiert
 * alle als gesehen, damit der Dialog nicht bei jedem Seitenaufruf wiederkommt.
 */
export function AnnouncementDialog({ announcements }: { announcements: Announcement[] }) {
  const [open, setOpen] = useState(announcements.length > 0);
  const [index, setIndex] = useState(0);
  if (announcements.length === 0) return null;

  const current = announcements[index];
  const isLast = index === announcements.length - 1;
  const hasImages = current.steps.some((s) => typeof s !== "string");

  function close() {
    setOpen(false);
    // Fehler still ignorieren — schlimmstenfalls erscheint der Dialog erneut.
    markAnnouncementSeen(announcements[0].id).catch(() => {});
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent size={hasImages ? "lg" : "sm"}>
        <DialogHeader>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-primary">
            <Sparkles className="h-4 w-4" /> Neu
            {announcements.length > 1 && (
              <span className="text-muted-foreground">
                · {index + 1} von {announcements.length}
              </span>
            )}
          </div>
          <DialogTitle>{current.title}</DialogTitle>
          <DialogDescription>{current.intro}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ol className={hasImages ? "space-y-5 text-sm" : "space-y-2 text-sm"}>
            {current.steps.map((step, i) => {
              const text = typeof step === "string" ? step : step.text;
              return (
                <li key={i} className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-medium text-primary">
                    {i + 1}
                  </span>
                  <div className="min-w-0 space-y-2">
                    <p>{text}</p>
                    {typeof step !== "string" && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={step.image}
                        alt={step.alt}
                        loading="lazy"
                        className="w-full rounded-md border"
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </DialogBody>
        <DialogFooter>
          {isLast ? (
            <Button type="button" onClick={close}>
              Verstanden
            </Button>
          ) : (
            <Button type="button" onClick={() => setIndex(index + 1)}>
              Weiter
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
