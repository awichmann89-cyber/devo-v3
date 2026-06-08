"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { copyProject } from "./copy-actions";
import { toast } from "sonner";

interface Props {
  id: string;
  name: string;
  planningStart: string; // ISO
  planningEnd: string;   // ISO
}

export function CopyProjectButton({ id, name, planningStart, planningEnd }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Vorausgefüllte Defaults: Name mit (Kopie)-Suffix, Daten 7 Tage verschoben.
  const [newName, setNewName] = useState(`${name} (Kopie)`);
  const [newStart, setNewStart] = useState(() => shiftISO(planningStart, 7));
  const [newEnd, setNewEnd] = useState(() => shiftISO(planningEnd, 7));

  function handleOpenChange(o: boolean) {
    if (!o) {
      // Beim Schließen Defaults zurücksetzen, falls Dialog wieder geöffnet wird
      setNewName(`${name} (Kopie)`);
      setNewStart(shiftISO(planningStart, 7));
      setNewEnd(shiftISO(planningEnd, 7));
    }
    setOpen(o);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) {
      toast.error("Name darf nicht leer sein");
      return;
    }
    const start = new Date(newStart);
    const end = new Date(newEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      toast.error("Ungültiges Datum");
      return;
    }
    if (end < start) {
      toast.error("Planungs-Ende muss nach Start liegen");
      return;
    }
    startTransition(async () => {
      try {
        await copyProject(id, {
          name: newName.trim(),
          planningStart: start,
          planningEnd: end,
        });
        // copyProject redirected — wir kommen hier nicht zurück
      } catch (e) {
        if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
        toast.error(
          "Kopieren fehlgeschlagen",
          { description: e instanceof Error ? e.message : "" }
        );
      }
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        title="Projekt mit Material und Personal als Kopie auf neues Datum anlegen"
      >
        <Copy className="h-4 w-4" /> Kopieren
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5" /> Projekt kopieren
            </DialogTitle>
            <DialogDescription>
              Material-Buchungen, Personal &amp; Transport, Gruppen, Notizen und
              Berechnungszeiträume werden übernommen — Berechnungszeiträume
              werden um die gleiche Differenz verschoben wie der Planungsstart.
              Rechnungen, Angebote und Pack-Scans werden nicht mitkopiert.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="copy-name">Name</Label>
              <Input
                id="copy-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                autoFocus
                maxLength={200}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="copy-start">Planungsstart</Label>
                <Input
                  id="copy-start"
                  type="date"
                  value={newStart}
                  onChange={(e) => setNewStart(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="copy-end">Planungsende</Label>
                <Input
                  id="copy-end"
                  type="date"
                  value={newEnd}
                  onChange={(e) => setNewEnd(e.target.value)}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Kopie anlegen
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Verschiebt eine ISO-Datums-String um N Tage und liefert eine `yyyy-MM-dd`-Form
 * (für `<input type="date">`).
 */
function shiftISO(iso: string, days: number): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
