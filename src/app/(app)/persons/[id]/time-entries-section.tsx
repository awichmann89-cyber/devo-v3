"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Clock, FileDown, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  clockToMinutes,
  formatMinutes,
  minutesToClock,
  timeEntryCost,
  workedMinutes,
} from "@/lib/personnel-costs";
import { EmploymentType } from "@prisma/client";
import {
  addTimeEntryForPerson,
  deleteTimeEntry,
  updateTimeEntry,
} from "./time-actions";

export interface PersonTimeEntryVM {
  id: string;
  projectId: string;
  projectName: string;
  workDate: string; // ISO
  startMinute: number;
  endMinute: number;
  breakMinutes: number;
  hourlyWageSnapshot: number | null;
  notes: string | null;
}

export interface ProjectOptionVM {
  id: string;
  name: string;
}

type DialogState = {
  entryId: string | null;
  projectId: string;
  workDate: string;
  start: string;
  end: string;
  breakMinutes: string;
  wage: string;
  notes: string;
} | null;

/** "YYYY-MM" des Eintrags (UTC-basiert, workDate ist tagesgenau). */
function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function TimeEntriesSection({
  personId,
  employmentType,
  hourlyWage,
  entries,
  projects,
}: {
  personId: string;
  employmentType: EmploymentType;
  hourlyWage: number | null;
  entries: PersonTimeEntryVM[];
  projects: ProjectOptionVM[];
}) {
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleting, setDeleting] = useState<PersonTimeEntryVM | null>(null);

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(currentMonth);

  // Auswählbare Monate: alle mit Einträgen + aktueller Monat, absteigend.
  const months = useMemo(() => {
    const set = new Set<string>(entries.map((e) => monthOf(e.workDate)));
    set.add(currentMonth);
    return [...set].sort().reverse();
  }, [entries, currentMonth]);

  const monthEntries = useMemo(
    () =>
      entries
        .filter((e) => monthOf(e.workDate) === month)
        .sort((a, b) => a.workDate.localeCompare(b.workDate)),
    [entries, month]
  );

  const totalMinutes = monthEntries.reduce((s, e) => s + workedMinutes(e), 0);
  const totalWage = monthEntries.reduce(
    (s, e) =>
      s +
      timeEntryCost({
        startMinute: e.startMinute,
        endMinute: e.endMinute,
        breakMinutes: e.breakMinutes,
        hourlyWageSnapshot: e.hourlyWageSnapshot,
      }),
    0
  );

  function openCreate() {
    setDialog({
      entryId: null,
      projectId: projects[0]?.id ?? "",
      workDate: `${month}-01`,
      start: "08:00",
      end: "18:00",
      breakMinutes: "0",
      wage:
        employmentType === "MINIJOBBER" && hourlyWage != null
          ? String(hourlyWage)
          : "",
      notes: "",
    });
  }

  function openEdit(e: PersonTimeEntryVM) {
    setDialog({
      entryId: e.id,
      projectId: e.projectId,
      workDate: e.workDate.slice(0, 10),
      start: minutesToClock(e.startMinute),
      end: minutesToClock(e.endMinute),
      breakMinutes: String(e.breakMinutes),
      wage: e.hourlyWageSnapshot != null ? String(e.hourlyWageSnapshot) : "",
      notes: e.notes ?? "",
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dialog) return;
    if (!dialog.projectId) {
      toast.error("Bitte ein Projekt wählen");
      return;
    }
    const payload = {
      projectId: dialog.projectId,
      workDate: dialog.workDate,
      start: dialog.start,
      end: dialog.end,
      breakMinutes: Number(dialog.breakMinutes) || 0,
      hourlyWageSnapshot: dialog.wage !== "" ? Number(dialog.wage) : null,
      notes: dialog.notes || null,
    };
    startTransition(async () => {
      try {
        if (dialog.entryId) {
          await updateTimeEntry(dialog.entryId, payload);
          toast.success("Eintrag aktualisiert");
        } else {
          await addTimeEntryForPerson(personId, payload);
          toast.success("Eintrag angelegt");
        }
        setDialog(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
      }
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    const id = deleting.id;
    startTransition(async () => {
      try {
        await deleteTimeEntry(id);
        toast.success("Eintrag gelöscht");
        setDeleting(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler beim Löschen");
      }
    });
  }

  const timesheetUrl = `/api/persons/${personId}/timesheet/pdf?month=${month}&download=1`;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" /> Arbeitszeiten
          </CardTitle>
          <CardDescription>
            Erfasste Ist-Zeiten — selbst eingetragen über den persönlichen Link
            oder hier vom Büro gepflegt.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={m}>
                  {monthLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" asChild>
            <a href={timesheetUrl} title="Stundenzettel für den gewählten Monat herunterladen">
              <FileDown className="h-4 w-4" /> Stundenzettel (PDF)
            </a>
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Eintrag
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table className="[&_td]:px-3 [&_td]:py-1.5 [&_th]:px-3">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">Datum</TableHead>
              <TableHead>Projekt</TableHead>
              <TableHead className="w-[120px]">Beginn–Ende</TableHead>
              <TableHead className="w-[80px] text-right">Pause</TableHead>
              <TableHead className="w-[80px] text-right">Dauer</TableHead>
              <TableHead className="w-[110px] text-right">Vergütung</TableHead>
              <TableHead className="w-[90px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {monthEntries.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  Keine Einträge in {monthLabel(month)}
                </TableCell>
              </TableRow>
            )}
            {monthEntries.map((e) => {
              const minutes = workedMinutes(e);
              const cost = timeEntryCost({
                startMinute: e.startMinute,
                endMinute: e.endMinute,
                breakMinutes: e.breakMinutes,
                hourlyWageSnapshot: e.hourlyWageSnapshot,
              });
              return (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">
                    {formatDate(e.workDate)}
                  </TableCell>
                  <TableCell>
                    <div className="truncate">{e.projectName}</div>
                    {e.notes && (
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {e.notes}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {minutesToClock(e.startMinute)}–{minutesToClock(e.endMinute)}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {e.breakMinutes > 0 ? `${e.breakMinutes} Min.` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatMinutes(minutes)} h
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {e.hourlyWageSnapshot != null ? formatCurrency(cost) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(e)}
                        title="Bearbeiten"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleting(e)}
                        title="Löschen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {monthEntries.length > 0 && (
              <TableRow className="border-t-2 bg-muted/30 font-medium">
                <TableCell colSpan={4}>Summe {monthLabel(month)}</TableCell>
                <TableCell className="text-right font-mono">
                  {formatMinutes(totalMinutes)} h
                </TableCell>
                <TableCell className="text-right font-mono">
                  {totalWage > 0 ? formatCurrency(totalWage) : "—"}
                </TableCell>
                <TableCell />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      {/* Office-Dialog: Eintrag anlegen/bearbeiten (inkl. Lohn-Korrektur) */}
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialog?.entryId ? "Zeiteintrag bearbeiten" : "Zeiteintrag anlegen"}
            </DialogTitle>
            <DialogDescription>
              Der Stundenlohn wird pro Eintrag festgeschrieben — Korrekturen
              hier wirken nur auf diesen Eintrag.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Projekt</Label>
              <Combobox
                value={dialog?.projectId ?? ""}
                onValueChange={(v) =>
                  setDialog((d) => (d ? { ...d, projectId: v } : d))
                }
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
                emptyLabel="— Projekt wählen —"
                placeholder="Projekt suchen…"
                disabled={dialog?.entryId != null}
              />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="space-y-2 col-span-2 sm:col-span-1">
                <Label>Datum</Label>
                <Input
                  type="date"
                  value={dialog?.workDate ?? ""}
                  onChange={(e) =>
                    setDialog((d) => (d ? { ...d, workDate: e.target.value } : d))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Beginn</Label>
                <Input
                  type="time"
                  value={dialog?.start ?? ""}
                  onChange={(e) =>
                    setDialog((d) => (d ? { ...d, start: e.target.value } : d))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Ende</Label>
                <Input
                  type="time"
                  value={dialog?.end ?? ""}
                  onChange={(e) =>
                    setDialog((d) => (d ? { ...d, end: e.target.value } : d))
                  }
                  required
                />
              </div>
              <div className="space-y-2 col-span-2 sm:col-span-1">
                <Label>Pause (Min.)</Label>
                <Input
                  type="number"
                  min="0"
                  max="720"
                  step="5"
                  value={dialog?.breakMinutes ?? "0"}
                  onChange={(e) =>
                    setDialog((d) =>
                      d ? { ...d, breakMinutes: e.target.value } : d
                    )
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Stundenlohn (€, für diesen Eintrag)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={dialog?.wage ?? ""}
                onChange={(e) =>
                  setDialog((d) => (d ? { ...d, wage: e.target.value } : d))
                }
                placeholder="leer = keine Vergütungsberechnung"
              />
            </div>
            <div className="space-y-2">
              <Label>Notiz (optional)</Label>
              <Textarea
                value={dialog?.notes ?? ""}
                onChange={(e) =>
                  setDialog((d) => (d ? { ...d, notes: e.target.value } : d))
                }
                rows={2}
                maxLength={500}
              />
            </div>
            {dialog &&
              /^\d{2}:\d{2}$/.test(dialog.start) &&
              /^\d{2}:\d{2}$/.test(dialog.end) && (
                <p className="text-sm text-muted-foreground">
                  Dauer:{" "}
                  <strong className="font-mono">
                    {formatMinutes(
                      workedMinutes({
                        startMinute: clockToMinutes(dialog.start),
                        endMinute: clockToMinutes(dialog.end),
                        breakMinutes: Number(dialog.breakMinutes) || 0,
                      })
                    )}{" "}
                    h
                  </strong>
                </p>
              )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog(null)}
                disabled={pending}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {dialog?.entryId ? "Speichern" : "Anlegen"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Zeiteintrag löschen?"
        description={
          deleting && (
            <>
              Eintrag vom <strong>{formatDate(deleting.workDate)}</strong> (
              {minutesToClock(deleting.startMinute)}–
              {minutesToClock(deleting.endMinute)}) wird unwiderruflich
              gelöscht.
            </>
          )
        }
        confirmLabel="Löschen"
        pending={pending}
        onConfirm={confirmDelete}
      />
    </Card>
  );
}
