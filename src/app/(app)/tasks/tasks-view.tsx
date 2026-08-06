"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { ProjectStatus } from "@prisma/client";
import { ListCard } from "@/components/layout/list-card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import {
  FilterChips,
  FilterDivider,
  FilterResetButton,
  FilterSearch,
} from "@/components/filters/filter-controls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListTodo } from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/toast";
import { cn, formatDate } from "@/lib/utils";
import { projectStatusLabel, projectStatusVariant } from "@/lib/labels";
import type { MentionCandidate } from "@/lib/note-tasks";
import { toggleProjectNoteTask } from "../projects/[id]/notes-actions";

export interface TaskVM {
  /** `noteId:line` — eindeutig, solange die Notiz unverändert ist. */
  id: string;
  noteId: string;
  noteTitle: string;
  line: number;
  done: boolean;
  text: string;
  dueDate: string | null;
  assigneeIds: string[];
  mentions: { label: string; userId: string | null }[];
  projectId: string;
  projectName: string;
  projectStatus: ProjectStatus;
}

/** Kein bestimmter Benutzer ausgewählt — Radix-Select verträgt kein "". */
const NO_PERSON = "__none__";

const SCOPES = [
  { value: "me", label: "Meine" },
  { value: "all", label: "Alle" },
  { value: "unassigned", label: "Nicht zugewiesen" },
];

const STATUSES = [
  { value: "open", label: "Offen" },
  { value: "done", label: "Erledigt" },
];

type Bucket = "overdue" | "today" | "week" | "later" | "none";

const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: "Überfällig",
  today: "Heute",
  week: "Diese Woche",
  later: "Später",
  none: "Ohne Frist",
};

const BUCKET_ORDER: Bucket[] = ["overdue", "today", "week", "later", "none"];

export function TasksView({
  tasks,
  people,
  currentUserId,
  today,
  canWrite,
}: {
  tasks: TaskVM[];
  people: MentionCandidate[];
  currentUserId: string;
  /** Heutiger Tag als ISO-String, auf dem Server bestimmt. */
  today: string;
  canWrite: boolean;
}) {
  const [scope, setScope] = useState<string>("me");
  const [status, setStatus] = useState<string>("open");
  const [search, setSearch] = useState("");
  const [, startTransition] = useTransition();

  // Optimistische Haken, bis der Server den neuen Stand geliefert hat.
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  useEffect(() => setChecked({}), [tasks]);

  const todayMs = useMemo(() => new Date(today).getTime(), [today]);
  const weekEndMs = useMemo(() => {
    const end = new Date(today);
    // ISO-Woche: Montag = 1 … Sonntag = 7.
    const isoWeekday = end.getUTCDay() === 0 ? 7 : end.getUTCDay();
    end.setUTCDate(end.getUTCDate() + (7 - isoWeekday));
    return end.getTime();
  }, [today]);

  const isDone = (task: TaskVM) => checked[task.id] ?? task.done;

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (status === "open" ? isDone(task) : !isDone(task)) return false;

      if (scope === "me" && !task.assigneeIds.includes(currentUserId)) return false;
      if (scope === "unassigned" && task.assigneeIds.length > 0) return false;
      if (
        scope !== "me" &&
        scope !== "all" &&
        scope !== "unassigned" &&
        !task.assigneeIds.includes(scope)
      ) {
        return false;
      }

      if (!needle) return true;
      return (
        task.text.toLowerCase().includes(needle) ||
        task.projectName.toLowerCase().includes(needle) ||
        task.noteTitle.toLowerCase().includes(needle)
      );
    });
    // `checked` gehört bewusst dazu: Abhaken darf die Liste sofort umsortieren.
  }, [tasks, scope, status, search, currentUserId, checked]);

  function bucketOf(task: TaskVM): Bucket {
    if (!task.dueDate) return "none";
    const due = new Date(task.dueDate).getTime();
    if (due < todayMs) return "overdue";
    if (due === todayMs) return "today";
    return due <= weekEndMs ? "week" : "later";
  }

  const groups = useMemo(() => {
    const map = new Map<Bucket, TaskVM[]>();
    for (const task of filtered) {
      const bucket = bucketOf(task);
      const list = map.get(bucket) ?? [];
      list.push(task);
      map.set(bucket, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          (a.dueDate ?? "").localeCompare(b.dueDate ?? "") ||
          a.projectName.localeCompare(b.projectName, "de") ||
          a.text.localeCompare(b.text, "de")
      );
    }
    return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => ({
      bucket: b,
      tasks: map.get(b)!,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, todayMs, weekEndMs]);

  const isDefault = scope === "me" && status === "open" && search === "";
  const selectedPerson =
    scope === "me" || scope === "all" || scope === "unassigned" ? NO_PERSON : scope;

  function handleToggle(task: TaskVM, next: boolean) {
    setChecked((prev) => ({ ...prev, [task.id]: next }));
    startTransition(async () => {
      try {
        await toggleProjectNoteTask(task.noteId, task.line, next);
        if (next) toast.success("Aufgabe erledigt");
      } catch (err) {
        setChecked((prev) => {
          const { [task.id]: _removed, ...rest } = prev;
          return rest;
        });
        toastError(err, "Speichern");
      }
    });
  }

  return (
    <div className="space-y-4">
      <ListCard
        title="Aufgaben"
        info={
          <>
            Alle Aufgaben aus den Projektnotizen. In der Notiz weist{" "}
            <code>@Name</code> eine Aufgabe einem Benutzer zu,{" "}
            <code>!20.08.2026</code> setzt die Frist. Abhaken schreibt direkt in
            die Notiz zurück.
          </>
        }
        count={{ shown: filtered.length, total: tasks.length }}
        filters={
          <>
            <FilterChips items={SCOPES} value={scope} onChange={setScope} />
            <Select
              value={selectedPerson}
              onValueChange={(v) => setScope(v === NO_PERSON ? "all" : v)}
            >
              <SelectTrigger
                className="w-[190px] text-xs text-muted-foreground"
                aria-label="Bestimmte Person"
              >
                <SelectValue placeholder="Bestimmte Person…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PERSON}>— Bestimmte Person —</SelectItem>
                {people.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FilterDivider />
            <FilterChips items={STATUSES} value={status} onChange={setStatus} />
            <FilterDivider />
            <FilterSearch
              value={search}
              onChange={setSearch}
              placeholder="Aufgabe, Projekt oder Notiz…"
            />
            {!isDefault && (
              <FilterResetButton
                onClick={() => {
                  setScope("me");
                  setStatus("open");
                  setSearch("");
                }}
              />
            )}
          </>
        }
      >
        {groups.length === 0 ? (
          <EmptyState
            bare
            icon={ListTodo}
            title={
              status === "done"
                ? "Noch nichts abgehakt."
                : "Keine offenen Aufgaben."
            }
            hint={
              scope === "me"
                ? "Aufgaben landen hier, sobald dich jemand in einer Projektnotiz mit @ erwähnt."
                : "Aufgaben entstehen als Checkliste in einer Projektnotiz."
            }
          />
        ) : (
          <div className="space-y-4">
            {groups.map(({ bucket, tasks: bucketTasks }) => (
              <section key={bucket}>
                <h2
                  className={cn(
                    "mb-1.5 text-[11px] font-bold uppercase tracking-[.09em]",
                    bucket === "overdue" ? "text-destructive" : "text-faint"
                  )}
                >
                  {BUCKET_LABEL[bucket]}{" "}
                  <span className="font-semibold opacity-70">
                    ({bucketTasks.length})
                  </span>
                </h2>
                <ul className="divide-y rounded-lg border">
                  {bucketTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      done={isDone(task)}
                      overdue={bucket === "overdue"}
                      dueToday={bucket === "today"}
                      currentUserId={currentUserId}
                      canWrite={canWrite}
                      onToggle={(next) => handleToggle(task, next)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </ListCard>
    </div>
  );
}

function TaskRow({
  task,
  done,
  overdue,
  dueToday,
  currentUserId,
  canWrite,
  onToggle,
}: {
  task: TaskVM;
  done: boolean;
  overdue: boolean;
  dueToday: boolean;
  currentUserId: string;
  canWrite: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <li className="flex items-start gap-3 p-3">
      <Checkbox
        checked={done}
        disabled={!canWrite}
        title={done ? "Aufgabe wieder öffnen" : "Aufgabe abhaken"}
        aria-label={done ? "Aufgabe wieder öffnen" : "Aufgabe abhaken"}
        className="mt-0.5 shrink-0"
        onCheckedChange={(value) => onToggle(value === true)}
      />

      <div className="min-w-0 flex-1">
        <div className={cn("text-sm", done && "text-muted-foreground line-through")}>
          {task.text || <span className="text-muted-foreground">(ohne Text)</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <Link
            href={`/projects/${task.projectId}`}
            className="font-medium text-foreground hover:text-primary hover:underline"
          >
            {task.projectName}
          </Link>
          <Badge size="sm" variant={projectStatusVariant(task.projectStatus)}>
            {projectStatusLabel(task.projectStatus)}
          </Badge>
          <span className="truncate">{task.noteTitle}</span>
          {task.mentions.map((mention, index) => (
            <Badge
              key={`${mention.label}-${index}`}
              size="sm"
              variant={
                mention.userId === null
                  ? "outline"
                  : mention.userId === currentUserId
                    ? "default"
                    : "info"
              }
              title={
                mention.userId === null ? "Kein Benutzer mit diesem Namen" : undefined
              }
            >
              @{mention.label}
            </Badge>
          ))}
        </div>
      </div>

      {task.dueDate && (
        <Badge
          size="sm"
          className="shrink-0"
          variant={overdue ? "destructive" : dueToday ? "warning" : "outline"}
        >
          {formatDate(task.dueDate)}
        </Badge>
      )}
    </li>
  );
}
