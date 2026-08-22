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
import { VehicleKind } from "@prisma/client";
import { vehicleKindLabel } from "@/lib/labels";
import type { ConflictHit } from "@/lib/booking-conflicts";
import {
  vehicleOptionHint,
  type VehicleOptionVM,
} from "../../vehicles/vehicle-dialog";
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
  addVehicleAssignment,
  updateVehicleAssignment,
} from "./vehicle-assignments-actions";
import { toastError } from "@/lib/toast";

/** Fahrer-Auswahl (Personalstamm, optional). */
export interface DriverOptionVM {
  id: string;
  name: string;
}

/** Einsatz einer Fuhrpark-Einheit an einer Transport-Position (Client-VM). */
export interface VehicleAssignmentVM {
  id: string;
  vehicleId: string;
  vehicleName: string;
  vehicleKind: VehicleKind;
  licensePlate: string | null;
  requiredLicense: string | null;
  billingPeriodId: string | null;
  periodStart: string | null; // ISO des gewählten Zeitraums
  periodEnd: string | null;
  periodNotes: string | null;
  plannedStart: string | null; // ISO
  plannedEnd: string | null; // ISO
  driverId: string | null;
  driverName: string | null;
  notes: string | null;
  /** Überbuchungs-Konflikte (Projektname + Stufe). */
  conflicts: ConflictHit[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Position, an die der Einsatz gehängt wird (nur beim Anlegen relevant). */
  projectServiceId: string | null;
  serviceName: string;
  /** Bestehender Einsatz → Edit-Modus. */
  assignment?: VehicleAssignmentVM | null;
  vehicles: VehicleOptionVM[];
  drivers: DriverOptionVM[];
  /** Zeiträume zur Auswahl — bereits auf die Gruppe der Position gefiltert. */
  periods: PeriodOptionVM[];
  /** Fremd-Einsätze pro Einheit (andere Projekte) für die Überbuchungs-Warnung. */
  vehicleBusy: Record<string, BusyIntervalVM[]>;
  planningStartIso: string;
  planningEndIso: string;
}

export function VehicleAssignmentDialog({
  open,
  onOpenChange,
  projectServiceId,
  serviceName,
  assignment,
  vehicles,
  drivers,
  periods,
  vehicleBusy,
  planningStartIso,
  planningEndIso,
}: Props) {
  const [vehicleId, setVehicleId] = useState("");
  // "" = kein Zeitraum → gesamter Planungszeitraum ist geblockt (Regelfall)
  const [billingPeriodId, setBillingPeriodId] = useState("");
  const [withTimes, setWithTimes] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [driverId, setDriverId] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  const selectedPeriod = useMemo(
    () => periods.find((p) => p.id === billingPeriodId) ?? null,
    [periods, billingPeriodId]
  );
  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === vehicleId) ?? null,
    [vehicles, vehicleId]
  );

  useEffect(() => {
    if (!open) return;
    setVehicleId(assignment?.vehicleId ?? "");
    // Default: gesamter Planungszeitraum — Fahrzeuge werden pauschal
    // gerechnet und für die komplette Planung geblockt.
    setBillingPeriodId(assignment?.billingPeriodId ?? "");
    setWithTimes(assignment?.plannedStart != null);
    setDriverId(assignment?.driverId ?? "");
    setNotes(assignment?.notes ?? "");
    if (assignment?.plannedStart && assignment.plannedEnd) {
      setStart(isoToLocalInput(assignment.plannedStart));
      setEnd(isoToLocalInput(assignment.plannedEnd));
    } else {
      setStart("");
      setEnd("");
    }
  }, [open, assignment]);

  // Uhrzeiten-Vorbelegung folgt dem gewählten Zeitraum (Muster Personal-Dialog).
  useEffect(() => {
    if (!open || assignment?.plannedStart) return;
    const baseStart = selectedPeriod?.start ?? planningStartIso;
    const baseEnd = selectedPeriod?.end ?? planningEndIso;
    const hasTimes = hasClockTimeIso(baseStart) || hasClockTimeIso(baseEnd);
    setStart(hasTimes ? isoToLocalInput(baseStart) : dateWithTime(baseStart, "08:00"));
    setEnd(hasTimes ? isoToLocalInput(baseEnd) : dateWithTime(baseEnd, "18:00"));
  }, [open, assignment, selectedPeriod, planningStartIso, planningEndIso]);

  // ----- Überbuchungs-Warnung: Kandidaten-Zeitfenster vs. Fremd-Einsätze -----
  const conflicts = useMemo(() => {
    const vid = assignment?.vehicleId ?? vehicleId;
    if (!vid) return [];
    const range = candidateRange({
      withTimes,
      start,
      end,
      period: selectedPeriod,
      planningStartIso,
      planningEndIso,
    });
    return evaluateBusy(range, vehicleBusy[vid] ?? []);
  }, [
    assignment,
    vehicleId,
    withTimes,
    start,
    end,
    selectedPeriod,
    vehicleBusy,
    planningStartIso,
    planningEndIso,
  ]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!assignment && !vehicleId) {
      toast.error("Bitte eine Fuhrpark-Einheit auswählen");
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
      vehicleId: assignment?.vehicleId ?? vehicleId,
      billingPeriodId: billingPeriodId || null,
      plannedStart: withTimes ? localInputToIso(start) : null,
      plannedEnd: withTimes ? localInputToIso(end) : null,
      driverId: driverId || null,
      notes: notes || null,
    };

    startTransition(async () => {
      try {
        if (assignment) {
          await updateVehicleAssignment(assignment.id, payload);
          toast.success("Einsatz aktualisiert");
        } else if (projectServiceId) {
          await addVehicleAssignment(projectServiceId, payload);
          toast.success("Einheit eingeplant");
        }
        onOpenChange(false);
      } catch (err) {
        toastError(err, "Speichern");
      }
    });
  }

  const requiredLicense =
    assignment?.requiredLicense ?? selectedVehicle?.requiredLicense ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            {assignment ? "Einsatz bearbeiten" : "Fahrzeug/Anhänger einplanen"}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <span>
              Position: <strong>{serviceName}</strong>. Die Einheit wird für den
              gewählten Zeitraum geblockt und auf Überbuchungen geprüft.
            </span>
            <InfoHint text="Transport wird immer pauschal gerechnet — der Preis steht an der Position, der Einsatz dient der Disposition. Zugfahrzeug und Anhänger werden als zwei Einsätze an derselben Position geplant." />
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {assignment ? (
            <div className="space-y-1">
              <Label>Einheit</Label>
              <p className="text-sm font-medium">
                {assignment.vehicleName}{" "}
                <span className="font-normal text-muted-foreground">
                  (
                  {vehicleOptionHint({
                    kind: assignment.vehicleKind,
                    licensePlate: assignment.licensePlate,
                    requiredLicense: assignment.requiredLicense,
                  })}
                  )
                </span>
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Einheit</Label>
              <Combobox
                value={vehicleId}
                onValueChange={setVehicleId}
                options={vehicles.map((v) => ({
                  value: v.id,
                  label: v.name,
                  hint: vehicleOptionHint(v),
                }))}
                emptyLabel="— Fahrzeug/Anhänger wählen —"
                placeholder="Bezeichnung oder Kennzeichen suchen…"
              />
              {vehicles.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Noch keine aktiven Einheiten — lege sie unter Stammdaten →
                  Fuhrpark an.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label>Blockzeitraum</Label>
              <InfoHint text="Standard ist der gesamte Planungszeitraum des Projekts. Nur wenn die Einheit tatsächlich früher frei ist, auf einen Berechnungszeitraum eingrenzen." />
            </div>
            <Select
              value={billingPeriodId || "__none__"}
              onValueChange={(v) => setBillingPeriodId(v === "__none__" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
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
                id="va-times"
                checked={withTimes}
                onCheckedChange={(v) => setWithTimes(v === true)}
              />
              <Label htmlFor="va-times" className="cursor-pointer font-normal">
                Uhrzeiten angeben (Abfahrt/Rückkehr)
              </Label>
            </div>
            {withTimes && (
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div className="space-y-2">
                  <Label htmlFor="va-start">Beginn</Label>
                  <Input
                    id="va-start"
                    type="datetime-local"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="va-end">Ende</Label>
                  <Input
                    id="va-end"
                    type="datetime-local"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <ConflictWarning conflicts={conflicts} resource="Die Einheit" />

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label>Fahrer (optional)</Label>
              {requiredLicense && (
                <InfoHint
                  text={`Diese Einheit erfordert Führerscheinklasse ${requiredLicense}.`}
                />
              )}
            </div>
            <Combobox
              value={driverId}
              onValueChange={setDriverId}
              options={drivers.map((d) => ({ value: d.id, label: d.name }))}
              emptyLabel="— kein Fahrer eingetragen —"
              placeholder="Name suchen…"
              clearable
            />
            {requiredLicense && (
              <p className="text-xs text-muted-foreground">
                Erforderliche Führerscheinklasse: {requiredLicense}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="va-notes">Notiz (optional)</Label>
            <Textarea
              id="va-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="z.B. Beladung Freitag 07:00, Rückfahrt über Lager"
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
