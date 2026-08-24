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
import { InfoHint } from "@/components/ui/info-hint";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { EmploymentType } from "@prisma/client";
import { employmentTypeLabel } from "@/lib/labels";
import type { ConflictHit } from "@/lib/booking-conflicts";
import { formatDate } from "@/lib/utils";
import {
  ConflictWarning,
  candidateRange,
  dateWithTime,
  evaluateBusy,
  hasClockTimeIso,
  isoToLocalInput,
  localInputToIso,
  periodLabel,
  type BusyIntervalVM,
  type PeriodOptionVM,
} from "@/components/project/assignment-scheduling";
import {
  addPersonAssignment,
  updatePersonAssignment,
} from "./person-assignments-actions";
import { toastError } from "@/lib/toast";

// Zeit-Helfer und Zeitraum-Labels liegen in
// components/project/assignment-scheduling.tsx — Personal- und
// Fuhrpark-Dialog teilen sie. Re-Export, weil die Services-Section die
// Typen und periodLabel von hier bezieht.
export {
  hasClockTimeIso,
  periodLabel,
  type BusyIntervalVM,
  type PeriodOptionVM,
};

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
  billingPeriodId: string | null;
  periodStart: string | null; // ISO des gewählten Zeitraums
  periodEnd: string | null;
  periodNotes: string | null;
  plannedStart: string | null; // ISO
  plannedEnd: string | null; // ISO
  agreedRate: number | null;
  hourlyRate: number | null;
  invoiceReceived: boolean;
  notes: string | null;
  // Summe der erfassten Ist-Minuten (read-only Anzeige)
  loggedMinutes: number;
  // Geplante Minuten aus dem effektiven Zeitfenster (0 = ganztägig/unbekannt)
  plannedMinutes: number;
  // Überbuchungs-Konflikte (Projektname + Stufe: Überschneidung / selber Tag)
  conflicts: ConflictHit[];
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
  /** Zeiträume zur Auswahl — bereits auf die Gruppe der Position gefiltert. */
  periods: PeriodOptionVM[];
  /** Fremd-Einsätze pro Person (andere Projekte) für die Überbuchungs-Warnung. */
  personBusy: Record<string, BusyIntervalVM[]>;
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
  periods,
  personBusy,
  planningStartIso,
  planningEndIso,
}: Props) {
  const [personId, setPersonId] = useState("");
  // "" = kein Zeitraum → Fallback Projekt-Planungszeitraum
  const [billingPeriodId, setBillingPeriodId] = useState("");
  const [withTimes, setWithTimes] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  // Vergütungsart (Freelancer): Pauschale/Tagessatz gesamt ODER nach Stunden
  const [payKind, setPayKind] = useState<"agreed" | "hourly">("agreed");
  const [agreedRate, setAgreedRate] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  const selectedPerson = useMemo(
    () => persons.find((p) => p.id === personId) ?? null,
    [persons, personId]
  );
  const employmentType = assignment?.employmentType ?? selectedPerson?.employmentType;
  const selectedPeriod = useMemo(
    () => periods.find((p) => p.id === billingPeriodId) ?? null,
    [periods, billingPeriodId]
  );

  useEffect(() => {
    if (!open) return;
    setPersonId(assignment?.personId ?? "");
    // Default beim Anlegen: erster Zeitraum der Gruppe/des Projekts.
    setBillingPeriodId(assignment ? (assignment.billingPeriodId ?? "") : (periods[0]?.id ?? ""));
    setWithTimes(assignment?.plannedStart != null);
    setPayKind(assignment?.hourlyRate != null ? "hourly" : "agreed");
    setAgreedRate(assignment?.agreedRate != null ? String(assignment.agreedRate) : "");
    setHourlyRate(assignment?.hourlyRate != null ? String(assignment.hourlyRate) : "");
    setNotes(assignment?.notes ?? "");
    if (assignment?.plannedStart && assignment.plannedEnd) {
      setStart(isoToLocalInput(assignment.plannedStart));
      setEnd(isoToLocalInput(assignment.plannedEnd));
    } else {
      setStart("");
      setEnd("");
    }
  }, [open, assignment, periods]);

  // Uhrzeiten-Vorbelegung folgt dem gewählten Zeitraum: trägt er eigene
  // Uhrzeiten, werden GENAU DIESE übernommen; sonst 08:00–18:00 als Default.
  useEffect(() => {
    if (!open || assignment?.plannedStart) return;
    const baseStart = selectedPeriod?.start ?? planningStartIso;
    const baseEnd = selectedPeriod?.end ?? planningEndIso;
    const hasTimes = hasClockTimeIso(baseStart) || hasClockTimeIso(baseEnd);
    setStart(hasTimes ? isoToLocalInput(baseStart) : dateWithTime(baseStart, "08:00"));
    setEnd(hasTimes ? isoToLocalInput(baseEnd) : dateWithTime(baseEnd, "18:00"));
  }, [open, assignment, selectedPeriod, planningStartIso, planningEndIso]);

  // Beim Wechsel der Person: Freelancer-Sätze aus dem Stamm vorbelegen.
  function handlePersonChange(id: string) {
    setPersonId(id);
    const person = persons.find((p) => p.id === id);
    if (person?.employmentType === "FREELANCER") {
      setAgreedRate(person.defaultDayRate != null ? String(person.defaultDayRate) : "");
      setHourlyRate(person.hourlyWage != null ? String(person.hourlyWage) : "");
    } else {
      setAgreedRate("");
      setHourlyRate("");
    }
  }

  const personOptions = persons.map((p) => ({
    value: p.id,
    label: p.name,
    hint: employmentTypeLabel(p.employmentType),
  }));

  // ----- Überbuchungs-Warnung: Kandidaten-Zeitfenster vs. Fremd-Einsätze -----
  // Zweistufig: echte Zeitüberschneidung (rot) vs. gleicher Kalendertag (gelb).
  const conflicts = useMemo(() => {
    const pid = assignment?.personId ?? personId;
    if (!pid) return [];
    const range = candidateRange({
      withTimes,
      start,
      end,
      period: selectedPeriod,
      planningStartIso,
      planningEndIso,
    });
    return evaluateBusy(range, personBusy[pid] ?? []);
  }, [
    assignment,
    personId,
    withTimes,
    start,
    end,
    selectedPeriod,
    personBusy,
    planningStartIso,
    planningEndIso,
  ]);

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
      billingPeriodId: billingPeriodId || null,
      plannedStart: withTimes ? localInputToIso(start) : null,
      plannedEnd: withTimes ? localInputToIso(end) : null,
      agreedRate:
        employmentType === "FREELANCER" && payKind === "agreed" && agreedRate !== ""
          ? Number(agreedRate)
          : null,
      hourlyRate:
        employmentType === "FREELANCER" && payKind === "hourly" && hourlyRate !== ""
          ? Number(hourlyRate)
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
        toastError(err, "Speichern");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            {assignment ? "Einsatz bearbeiten" : "Person einplanen"}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <span>
              Position: <strong>{serviceName}</strong>. Eingeplante Personen sehen
              den Einsatz in ihrem persönlichen Kalender-Abo.
            </span>
            <InfoHint text="Tipp: Personal ohne berechnete Position? Lege eine nicht-abrechenbare Gruppe an und buche die Position dort — sie taucht dann nicht auf Angeboten/Rechnungen auf." />
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
              {/* autoFocus: Die Person ist das, weswegen der Dialog geoeffnet
                  wurde — der Cursor gehoert hierher, nicht in den Zeitraum. */}
              <Combobox
                autoFocus
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
            <div className="flex items-center gap-1.5">
              {/* „Einsatzzeitraum", nicht „Berechnungszeitraum": das Feld
                  entscheidet, WANN die Person arbeitet. Dass die Auswahl aus
                  den Berechnungszeitraeumen kommt, sagt der InfoHint. */}
              <Label>Einsatzzeitraum</Label>
              <InfoHint text="Zur Auswahl stehen die Berechnungszeiträume des Projekts. Ohne eigene Uhrzeiten übernimmt der Einsatz die Zeiten des gewählten Zeitraums — ganztägig nur, wenn der Zeitraum keine Uhrzeiten trägt (00:00)." />
            </div>
            <Select
              value={billingPeriodId || "__none__"}
              onValueChange={(v) => setBillingPeriodId(v === "__none__" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              {/* Reihenfolge identisch zum Fuhrpark-Dialog: der gesamte
                  Planungszeitraum steht immer zuoberst. Die Vorbelegung bleibt
                  unterschiedlich (Personal: erster Zeitraum) — das ist fachlich
                  gewollt, die Sortierung war nur Drift. */}
              <SelectContent>
                <SelectItem value="__none__">
                  Gesamter Planungszeitraum ({formatDate(planningStartIso)} –{" "}
                  {formatDate(planningEndIso)})
                </SelectItem>
                {periods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {periodLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="pa-times"
                checked={withTimes}
                onCheckedChange={(v) => setWithTimes(v === true)}
              />
              <Label htmlFor="pa-times" className="cursor-pointer font-normal">
                Uhrzeiten angeben (Call-Time)
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

          <ConflictWarning conflicts={conflicts} resource="Die Person" />

          {employmentType === "FREELANCER" && (
            <div className="space-y-2">
              <Label>Vergütung</Label>
              <div className="grid grid-cols-[180px_1fr] gap-2">
                <Select
                  value={payKind}
                  onValueChange={(v) => setPayKind(v as "agreed" | "hourly")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agreed">Tagessatz / Pauschale</SelectItem>
                    <SelectItem value="hourly">Nach Stunden</SelectItem>
                  </SelectContent>
                </Select>
                {payKind === "agreed" ? (
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={agreedRate}
                    onChange={(e) => setAgreedRate(e.target.value)}
                    placeholder="€ gesamt, z.B. 450,00"
                  />
                ) : (
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    placeholder="€ pro Stunde, z.B. 45,00"
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {payKind === "agreed"
                  ? "Pauschale zählt direkt als Projektkosten in der Gewinnrechnung."
                  : "Kosten = erfasste Stunden × Satz — die Person trägt ihre Zeiten über den persönlichen Link nach."}
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
