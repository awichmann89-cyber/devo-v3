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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { EmploymentType } from "@prisma/client";
import { employmentTypeLabel } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/utils";
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

/** Berechnungszeitraum des Projekts (ISO-Strings). */
export interface PeriodOptionVM {
  id: string;
  start: string;
  end: string;
  notes: string | null;
}

/** Fremd-Einsatz einer Person (anderes Projekt) für die Überbuchungs-Warnung. */
export interface BusyIntervalVM {
  projectName: string;
  start: string; // ISO, halboffenes Intervall [start, end)
  end: string;
  timed: boolean;
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
  // Überbuchungs-Konflikte (Projektnamen + Zeitfenster-Label)
  conflicts: string[];
}

/** Trägt der ISO-Zeitpunkt eine echte Uhrzeit (lokale Wanduhr ≠ 00:00)? */
export function hasClockTimeIso(iso: string): boolean {
  const d = new Date(iso);
  return d.getHours() !== 0 || d.getMinutes() !== 0;
}

/**
 * Anzeige-Label eines Berechnungszeitraums — inkl. Uhrzeiten, wenn der
 * Zeitraum welche trägt: "08.08.2026, 10:00–23:00 Uhr (Veranstaltungstag 1)".
 */
export function periodLabel(p: { start: string; end: string; notes: string | null }): string {
  const withTimes = hasClockTimeIso(p.start) || hasClockTimeIso(p.end);
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  let range: string;
  if (formatDate(p.start) === formatDate(p.end)) {
    range = withTimes
      ? `${formatDate(p.start)}, ${time(p.start)}–${time(p.end)} Uhr`
      : formatDate(p.start);
  } else {
    range = withTimes
      ? `${formatDate(p.start)} ${time(p.start)} – ${formatDate(p.end)} ${time(p.end)}`
      : `${formatDate(p.start)} – ${formatDate(p.end)}`;
  }
  return p.notes ? `${range} (${p.notes})` : range;
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

const DAY_MS = 24 * 60 * 60 * 1000;

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
  const candidateRange = useMemo((): { start: Date; end: Date } | null => {
    if (withTimes) {
      if (!start || !end) return null;
      return { start: new Date(start), end: new Date(end) };
    }
    const base = selectedPeriod ?? { start: planningStartIso, end: planningEndIso };
    // Zeitraum mit eigenen Uhrzeiten → exakt; sonst ganztägig (+1 Tag).
    if (hasClockTimeIso(base.start) || hasClockTimeIso(base.end)) {
      return { start: new Date(base.start), end: new Date(base.end) };
    }
    return {
      start: new Date(base.start),
      end: new Date(new Date(base.end).getTime() + DAY_MS),
    };
  }, [withTimes, start, end, selectedPeriod, planningStartIso, planningEndIso]);

  const overlaps = useMemo((): BusyIntervalVM[] => {
    const pid = assignment?.personId ?? personId;
    if (!pid || !candidateRange) return [];
    return (personBusy[pid] ?? []).filter(
      (b) =>
        candidateRange.start < new Date(b.end) &&
        new Date(b.start) < candidateRange.end
    );
  }, [assignment, personId, candidateRange, personBusy]);

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
            <Label>Berechnungszeitraum</Label>
            <Select
              value={billingPeriodId || "__none__"}
              onValueChange={(v) => setBillingPeriodId(v === "__none__" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {periodLabel(p)}
                  </SelectItem>
                ))}
                <SelectItem value="__none__">
                  Gesamter Planungszeitraum ({formatDate(planningStartIso)} –{" "}
                  {formatDate(planningEndIso)})
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Ohne eigene Uhrzeiten übernimmt der Einsatz die Zeiten des
              gewählten Zeitraums — ganztägig nur, wenn der Zeitraum keine
              Uhrzeiten trägt (00:00).
            </p>
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

          {overlaps.length > 0 && (
            <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive-subtle/50 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Überbuchung: bereits eingeplant in
              </p>
              <ul className="ml-6 list-disc text-xs text-destructive/90">
                {overlaps.map((b, i) => (
                  <li key={i}>
                    {b.projectName} —{" "}
                    {b.timed
                      ? `${formatDateTime(b.start)} – ${formatDateTime(b.end)}`
                      : `${formatDate(b.start)} – ${formatDate(new Date(new Date(b.end).getTime() - DAY_MS))} (ganztägig)`}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Einplanen ist trotzdem möglich — bitte Zeiten prüfen.
              </p>
            </div>
          )}

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
