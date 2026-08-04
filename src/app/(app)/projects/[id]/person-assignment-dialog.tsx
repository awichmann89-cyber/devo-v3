"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { EmploymentType } from "@prisma/client";
import { employmentTypeLabel } from "@/lib/labels";
import {
  addPersonAssignment,
  updatePersonAssignment,
} from "./person-assignments-actions";

/** Aktive Person für die Auswahl im Dialog. */
export interface PersonOptionVM {
  id: string;
  name: string;
  employmentType: EmploymentType;
  hourlyWage: number | null;
  defaultDayRate: number | null;
}

/** Einsatz einer Person an einer Service-Position (Client-VM). */
export interface PersonAssignmentVM {
  id: string;
  personId: string;
  personName: string;
  employmentType: EmploymentType;
  plannedStart: string | null; // ISO
  plannedEnd: string | null; // ISO
  agreedRate: number | null;
  invoiceReceived: boolean;
  notes: string | null;
  // Summe der erfassten Ist-Minuten (read-only Anzeige)
  loggedMinutes: number;
}

/** ISO-Instant → Wert für <input type="datetime-local"> (Browser-Lokalzeit). */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local-Wert (Browser-Lokalzeit) → ISO-Instant für den Server. */
function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}

/** Datum aus ISO + feste Uhrzeit → datetime-local-Vorbelegung. */
function dateWithTime(iso: string, time: string): string {
  return `${isoToLocalInput(iso).slice(0, 10)}T${time}`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Position, an die der Einsatz gehängt wird (nur beim Anlegen relevant). */
  projectServiceId: string | null;
  serviceName: string;
  /** Bestehender Einsatz → Edit-Modus. */
  assignment?: PersonAssignmentVM | null;
  persons: PersonOptionVM[];
  planningStartIso: string;
  planningEndIso: string;
}

export function PersonAssignmentDialog({
  open,
  onOpenChange,
  projectServiceId,
  serviceName,
  assignment,
  persons,
  planningStartIso,
  planningEndIso,
}: Props) {
  const [personId, setPersonId] = useState("");
  const [withTimes, setWithTimes] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [agreedRate, setAgreedRate] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  const selectedPerson = useMemo(
    () => persons.find((p) => p.id === personId) ?? null,
    [persons, personId]
  );
  const employmentType = assignment?.employmentType ?? selectedPerson?.employmentType;

  useEffect(() => {
    if (!open) return;
    setPersonId(assignment?.personId ?? "");
    setWithTimes(assignment?.plannedStart != null);
    setStart(
      assignment?.plannedStart
        ? isoToLocalInput(assignment.plannedStart)
        : dateWithTime(planningStartIso, "08:00")
    );
    setEnd(
      assignment?.plannedEnd
        ? isoToLocalInput(assignment.plannedEnd)
        : dateWithTime(planningEndIso, "18:00")
    );
    setAgreedRate(assignment?.agreedRate != null ? String(assignment.agreedRate) : "");
    setNotes(assignment?.notes ?? "");
  }, [open, assignment, planningStartIso, planningEndIso]);

  // Beim Wechsel der Person: Freelancer-Satz mit Standard-Tagessatz vorbelegen.
  function handlePersonChange(id: string) {
    setPersonId(id);
    const person = persons.find((p) => p.id === id);
    if (person?.employmentType === "FREELANCER") {
      setAgreedRate(person.defaultDayRate != null ? String(person.defaultDayRate) : "");
    } else {
      setAgreedRate("");
    }
  }

  const personOptions = persons.map((p) => ({
    value: p.id,
    label: p.name,
    hint: employmentTypeLabel(p.employmentType),
  }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!assignment && !personId) {
      toast.error("Bitte eine Person auswählen");
      return;
    }
    if (withTimes && (!start || !end)) {
      toast.error("Bitte Beginn und Ende angeben");
      return;
    }
    if (withTimes && new Date(end) < new Date(start)) {
      toast.error("Ende muss nach Beginn liegen");
      return;
    }

    const payload = {
      personId: assignment?.personId ?? personId,
      plannedStart: withTimes ? localInputToIso(start) : null,
      plannedEnd: withTimes ? localInputToIso(end) : null,
      agreedRate:
        employmentType === "FREELANCER" && agreedRate !== ""
          ? Number(agreedRate)
          : null,
      notes: notes || null,
    };

    startTransition(async () => {
      try {
        if (assignment) {
          await updatePersonAssignment(assignment.id, payload);
          toast.success("Einsatz aktualisiert");
        } else if (projectServiceId) {
          await addPersonAssignment(projectServiceId, payload);
          toast.success("Person eingeplant");
        }
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {assignment ? "Einsatz bearbeiten" : "Person einplanen"}
          </DialogTitle>
          <DialogDescription>
            Position: <strong>{serviceName}</strong>. Eingeplante Personen sehen
            den Einsatz in ihrem persönlichen Kalender-Abo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {assignment ? (
            <div className="space-y-1">
              <Label>Person</Label>
              <p className="text-sm font-medium">
                {assignment.personName}{" "}
                <span className="font-normal text-muted-foreground">
                  ({employmentTypeLabel(assignment.employmentType)})
                </span>
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Person</Label>
              <Combobox
                value={personId}
                onValueChange={handlePersonChange}
                options={personOptions}
                emptyLabel="— Person wählen —"
                placeholder="Name suchen…"
              />
              {persons.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Noch keine aktiven Personen — lege sie unter Stammdaten →
                  Personalstamm an.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="pa-times"
                checked={withTimes}
                onCheckedChange={(v) => setWithTimes(v === true)}
              />
              <Label htmlFor="pa-times" className="cursor-pointer font-normal">
                Geplante Zeiten angeben (sonst ganztägig über den
                Planungszeitraum)
              </Label>
            </div>
            {withTimes && (
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div className="space-y-2">
                  <Label htmlFor="pa-start">Beginn</Label>
                  <Input
                    id="pa-start"
                    type="datetime-local"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pa-end">Ende</Label>
                  <Input
                    id="pa-end"
                    type="datetime-local"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {employmentType === "FREELANCER" && (
            <div className="space-y-2">
              <Label htmlFor="pa-rate">Vereinbarter Satz (€, gesamt)</Label>
              <Input
                id="pa-rate"
                type="number"
                step="0.01"
                min="0"
                value={agreedRate}
                onChange={(e) => setAgreedRate(e.target.value)}
                placeholder="z.B. 450,00"
              />
              <p className="text-xs text-muted-foreground">
                Zählt automatisch als Projektkosten in der Gewinnrechnung.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="pa-notes">Notiz (optional)</Label>
            <Textarea
              id="pa-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="z.B. Treffpunkt Lager 07:30"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Tipp: Personal ohne berechnete Position? Lege eine
            nicht-abrechenbare Gruppe an und buche die Position dort — sie
            taucht dann nicht auf Angeboten/Rechnungen auf.
          </p>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {assignment ? "Speichern" : "Einplanen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
