"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ProjectStatus } from "@prisma/client";
import {
  clockToMinutes,
  formatMinutes,
  minutesToClock,
  workedMinutes,
} from "@/lib/personnel-costs";
import {
  addTimeEntryWithToken,
  deleteTimeEntryWithToken,
  updateTimeEntryWithToken,
} from "./einsatz-actions";

type AssignmentVM = {
  id: string;
  projectName: string;
  projectStatus: ProjectStatus;
  customerName: string | null;
  serviceName: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  // Gewählter Berechnungszeitraum (ganztägig-Basis vor dem Planungszeitraum)
  periodStart: string | null;
  periodEnd: string | null;
  periodNotes: string | null;
  planningStart: string;
  planningEnd: string;
  notes: string | null;
};

type TimeEntryVM = {
  id: string;
  assignmentId: string | null;
  projectName: string;
  workDate: string;
  startMinute: number;
  endMinute: number;
  breakMinutes: number;
  notes: string | null;
};

/**
 * Effektiver Einsatz-Zeitraum — Fallback-Kette:
 * Uhrzeiten → gewählter Berechnungszeitraum → Projekt-Planungszeitraum.
 */
function effectiveRange(a: AssignmentVM): { start: Date; end: Date } {
  return {
    start: new Date(a.plannedStart ?? a.periodStart ?? a.planningStart),
    end: new Date(a.plannedEnd ?? a.periodEnd ?? a.planningEnd),
  };
}

/** Trägt der ISO-Zeitpunkt eine echte Uhrzeit (lokale Wanduhr ≠ 00:00)? */
function hasClockTimeIso(iso: string): boolean {
  const d = new Date(iso);
  return d.getHours() !== 0 || d.getMinutes() !== 0;
}

function timeLabel(a: AssignmentVM): string {
  const time = (d: Date) =>
    d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (!a.plannedStart || !a.plannedEnd) {
    const start = a.periodStart ?? a.planningStart;
    const end = a.periodEnd ?? a.planningEnd;
    // Zeitraum mit eigenen Uhrzeiten → diese anzeigen, sonst ganztägig.
    if (hasClockTimeIso(start) || hasClockTimeIso(end)) {
      const s = new Date(start);
      const e = new Date(end);
      const range =
        s.toDateString() === e.toDateString()
          ? `${formatDate(s)}, ${time(s)}–${time(e)} Uhr`
          : `${formatDate(s)} ${time(s)} – ${formatDate(e)} ${time(e)}`;
      return a.periodNotes ? `${range} (${a.periodNotes})` : range;
    }
    const range =
      formatDate(start) === formatDate(end)
        ? formatDate(start)
        : `${formatDate(start)} – ${formatDate(end)}`;
    const label = a.periodNotes ? `${range} (${a.periodNotes})` : range;
    return `ganztägig, ${label}`;
  }
  const s = new Date(a.plannedStart);
  const e = new Date(a.plannedEnd);
  if (s.toDateString() === e.toDateString()) {
    return `${formatDate(s)}, ${time(s)}–${time(e)} Uhr`;
  }
  return `${formatDate(s)} ${time(s)} – ${formatDate(e)} ${time(e)}`;
}

type FormState = {
  entryId: string | null; // null = neuer Eintrag
  workDate: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string;
  breakMinutes: string;
  notes: string;
};

/** Formular für einen Zeiteintrag (anlegen oder bearbeiten). */
function TimeEntryForm({
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  initial: FormState;
  pending: boolean;
  onSubmit: (form: FormState) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial);

  const preview = useMemo(() => {
    if (!/^\d{2}:\d{2}$/.test(form.start) || !/^\d{2}:\d{2}$/.test(form.end)) {
      return null;
    }
    const minutes = workedMinutes({
      startMinute: clockToMinutes(form.start),
      endMinute: clockToMinutes(form.end),
      breakMinutes: Number(form.breakMinutes) || 0,
    });
    return minutes > 0 ? formatMinutes(minutes) : null;
  }, [form.start, form.end, form.breakMinutes]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
      className="space-y-3 rounded-md border bg-muted/30 p-3"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1 col-span-2 sm:col-span-1">
          <Label className="text-xs">Datum</Label>
          <Input
            type="date"
            value={form.workDate}
            onChange={(e) => setForm({ ...form, workDate: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Beginn</Label>
          <Input
            type="time"
            value={form.start}
            onChange={(e) => setForm({ ...form, start: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ende</Label>
          <Input
            type="time"
            value={form.end}
            onChange={(e) => setForm({ ...form, end: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1 col-span-2 sm:col-span-1">
          <Label className="text-xs">Pause (Min.)</Label>
          <Input
            type="number"
            min="0"
            max="720"
            step="5"
            value={form.breakMinutes}
            onChange={(e) => setForm({ ...form, breakMinutes: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Notiz (optional)</Label>
        <Textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={2}
          maxLength={500}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          {preview ? (
            <>
              Dauer: <strong className="font-mono">{preview} h</strong>
            </>
          ) : (
            "—"
          )}
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
            Abbrechen
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {initial.entryId ? "Speichern" : "Eintragen"}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function EinsatzClient({
  token,
  personName,
  assignments,
  timeEntries,
}: {
  token: string;
  personName: string;
  assignments: AssignmentVM[];
  timeEntries: TimeEntryVM[];
}) {
  const [pending, startTransition] = useTransition();
  // Offenes Formular: pro Einsatz eines (key = assignmentId), Edit via entryId
  const [openForm, setOpenForm] = useState<{
    assignmentId: string;
    initial: FormState;
  } | null>(null);
  const [deleting, setDeleting] = useState<TimeEntryVM | null>(null);
  const [expandedPast, setExpandedPast] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const now = new Date();
  const upcoming = assignments
    .filter((a) => effectiveRange(a).end >= now)
    .sort((a, b) => +effectiveRange(a).start - +effectiveRange(b).start);
  const past = assignments
    .filter((a) => effectiveRange(a).end < now)
    .sort((a, b) => +effectiveRange(b).start - +effectiveRange(a).start);

  const entriesByAssignment = useMemo(() => {
    const map = new Map<string, TimeEntryVM[]>();
    for (const e of timeEntries) {
      if (!e.assignmentId) continue;
      const arr = map.get(e.assignmentId) ?? [];
      arr.push(e);
      map.set(e.assignmentId, arr);
    }
    return map;
  }, [timeEntries]);
  const orphanEntries = timeEntries.filter(
    (e) => !e.assignmentId || !assignments.some((a) => a.id === e.assignmentId)
  );

  const icsUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/calendar/person.ics?token=${token}`
      : "";

  function defaultForm(a: AssignmentVM): FormState {
    const startIso = a.plannedStart ?? a.periodStart ?? a.planningStart;
    const endIso = a.plannedEnd ?? a.periodEnd ?? a.planningEnd;
    const start = new Date(startIso);
    const end = new Date(endIso);
    // Uhrzeiten aus Einsatz bzw. Zeitraum übernehmen; sonst 08:00–18:00.
    const hasTimes =
      a.plannedStart != null || hasClockTimeIso(startIso) || hasClockTimeIso(endIso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      entryId: null,
      workDate: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
      start: hasTimes
        ? minutesToClock(start.getHours() * 60 + start.getMinutes())
        : "08:00",
      end: hasTimes
        ? minutesToClock(end.getHours() * 60 + end.getMinutes())
        : "18:00",
      breakMinutes: "0",
      notes: "",
    };
  }

  function editForm(e: TimeEntryVM): FormState {
    return {
      entryId: e.id,
      workDate: e.workDate.slice(0, 10),
      start: minutesToClock(e.startMinute),
      end: minutesToClock(e.endMinute),
      breakMinutes: String(e.breakMinutes),
      notes: e.notes ?? "",
    };
  }

  function submitForm(assignmentId: string, form: FormState) {
    const payload = {
      workDate: form.workDate,
      start: form.start,
      end: form.end,
      breakMinutes: Number(form.breakMinutes) || 0,
      notes: form.notes || null,
    };
    startTransition(async () => {
      const res = form.entryId
        ? await updateTimeEntryWithToken(token, form.entryId, payload)
        : await addTimeEntryWithToken(token, assignmentId, payload);
      if (res.ok) {
        toast.success(form.entryId ? "Eintrag aktualisiert" : "Zeiten eingetragen");
        setOpenForm(null);
      } else {
        toast.error(res.error ?? "Fehler beim Speichern");
      }
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    const id = deleting.id;
    startTransition(async () => {
      const res = await deleteTimeEntryWithToken(token, id);
      if (res.ok) {
        toast.success("Eintrag gelöscht");
        setDeleting(null);
      } else {
        toast.error(res.error ?? "Fehler beim Löschen");
      }
    });
  }

  function copyIcsUrl() {
    navigator.clipboard.writeText(icsUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Kalender-Link kopiert");
    });
  }

  function renderEntryRow(e: TimeEntryVM, assignmentId: string | null) {
    const minutes = workedMinutes(e);
    return (
      <li
        key={e.id}
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-sm"
      >
        <span className="font-medium">{formatDate(e.workDate)}</span>
        <span className="font-mono text-muted-foreground">
          {minutesToClock(e.startMinute)}–{minutesToClock(e.endMinute)}
        </span>
        {e.breakMinutes > 0 && (
          <span className="text-xs text-muted-foreground">
            Pause {e.breakMinutes} Min.
          </span>
        )}
        <Badge variant="outline" className="gap-1 font-mono">
          <Clock className="h-3 w-3" />
          {formatMinutes(minutes)} h
        </Badge>
        {e.notes && (
          <span className="w-full text-xs text-muted-foreground sm:w-auto">
            {e.notes}
          </span>
        )}
        <span className="ml-auto flex gap-1">
          {assignmentId && (
            <Button
              variant="ghost"
              size="iconXs"
              
              disabled={pending}
              onClick={() =>
                setOpenForm({ assignmentId, initial: editForm(e) })
              }
              title="Bearbeiten"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="iconXs"
            className="text-destructive hover:text-destructive"
            disabled={pending}
            onClick={() => setDeleting(e)}
            title="Löschen"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </span>
      </li>
    );
  }

  function renderAssignmentCard(a: AssignmentVM, allowTimeEntry: boolean) {
    const entries = entriesByAssignment.get(a.id) ?? [];
    const formOpen = openForm?.assignmentId === a.id;
    return (
      <Card key={a.id}>
        <CardHeader className="pb-2">
          <CardTitle>{a.projectName}</CardTitle>
          <CardDescription className="space-y-0.5">
            <span className="block">
              {a.serviceName}
              {a.customerName ? ` · ${a.customerName}` : ""}
            </span>
            <span className="block font-medium text-foreground">
              {timeLabel(a)}
            </span>
            {a.notes && <span className="block">📝 {a.notes}</span>}
          </CardDescription>
        </CardHeader>
        {(allowTimeEntry || entries.length > 0) && (
          <CardContent className="space-y-3 pt-0">
            {entries.length > 0 && (
              <ul className="space-y-2">
                {entries.map((e) => renderEntryRow(e, a.id))}
              </ul>
            )}
            {formOpen ? (
              <TimeEntryForm
                key={openForm.initial.entryId ?? "new"}
                initial={openForm.initial}
                pending={pending}
                onSubmit={(form) => submitForm(a.id, form)}
                onCancel={() => setOpenForm(null)}
              />
            ) : (
              allowTimeEntry && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    setOpenForm({ assignmentId: a.id, initial: defaultForm(a) })
                  }
                >
                  <Plus className="h-4 w-4" /> Stunden erfassen
                </Button>
              )
            )}
          </CardContent>
        )}
      </Card>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <header>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <UserRound className="h-5 w-5" /> {personName}
            <InfoHint text="Persönlicher Bereich für Einsätze und Zeiterfassung — diesen Link bitte nicht weitergeben." />
          </h1>
        </header>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Kommende Einsätze
          </h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aktuell keine geplanten Einsätze.
            </p>
          ) : (
            upcoming.map((a) => renderAssignmentCard(a, false))
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Vergangene Einsätze — Stunden erfassen
          </h2>
          {past.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine vergangenen Einsätze.
            </p>
          ) : (
            <>
              {past.slice(0, 5).map((a) => renderAssignmentCard(a, true))}
              {past.length > 5 && (
                <>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      setExpandedPast((prev) =>
                        prev.has("older")
                          ? new Set<string>()
                          : new Set(["older"])
                      )
                    }
                  >
                    {expandedPast.has("older") ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    Ältere Einsätze ({past.length - 5})
                  </button>
                  {expandedPast.has("older") &&
                    past.slice(5).map((a) => renderAssignmentCard(a, true))}
                </>
              )}
            </>
          )}
        </section>

        {orphanEntries.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Weitere erfasste Zeiten
            </h2>
            <ul className="space-y-2">
              {orphanEntries.map((e) => (
                <li key={e.id} className="space-y-1">
                  <span className="text-xs text-muted-foreground">
                    {e.projectName}
                  </span>
                  {renderEntryRow(e, null)}
                </li>
              ))}
            </ul>
          </section>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <CalendarPlus className="h-4 w-4" /> Kalender abonnieren
              <InfoHint text={'Abonniere deine Einsätze in Google/Apple Kalender — neue Einsätze erscheinen automatisch. In der Kalender-App „Kalender abonnieren" bzw. „Per URL hinzufügen" wählen und diesen Link einfügen.'} />
            </CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Input readOnly value={icsUrl} className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={copyIcsUrl} title="Link kopieren">
              {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </Button>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Zeiteintrag löschen?"
        description={
          deleting && (
            <>
              Eintrag vom <strong>{formatDate(deleting.workDate)}</strong> (
              {minutesToClock(deleting.startMinute)}–
              {minutesToClock(deleting.endMinute)}) wird gelöscht.
            </>
          )
        }
        confirmLabel="Löschen"
        pending={pending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
