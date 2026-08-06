import { prisma } from "@/lib/prisma";
import { requireAuth, hasRole, CAN_WRITE } from "@/lib/auth-helpers";
import {
  parseNoteTasks,
  todayInAppTimezone,
  userLabel,
  type MentionCandidate,
} from "@/lib/note-tasks";
import { TasksView, type TaskVM } from "./tasks-view";

/**
 * Aufgaben aus allen Projektnotizen.
 *
 * Es gibt bewusst keine eigene Aufgabentabelle: Die Notiz bleibt die Quelle,
 * die Liste hier wird bei jedem Aufruf daraus abgeleitet. Damit kann nichts
 * auseinanderlaufen, und Abhaken schreibt weiterhin in die Notiz zurück.
 */
export default async function TasksPage() {
  const session = await requireAuth();
  const canWrite = hasRole(session.user.role, CAN_WRITE);

  const [users, notes] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.projectNote.findMany({
      select: {
        id: true,
        title: true,
        content: true,
        project: { select: { id: true, name: true, status: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const people: MentionCandidate[] = users.map((u) => ({
    id: u.id,
    name: userLabel(u),
  }));

  const tasks: TaskVM[] = notes.flatMap((note) =>
    parseNoteTasks(note.content, people).map((task) => ({
      id: `${note.id}:${task.line}`,
      noteId: note.id,
      noteTitle: note.title,
      line: task.line,
      done: task.done,
      text: task.text,
      dueDate: task.dueDate?.toISOString() ?? null,
      assigneeIds: task.assigneeIds,
      mentions: task.mentions,
      projectId: note.project.id,
      projectName: note.project.name,
      projectStatus: note.project.status,
    }))
  );

  return (
    <TasksView
      tasks={tasks}
      people={people}
      currentUserId={session.user.id}
      today={todayInAppTimezone().toISOString()}
      canWrite={canWrite}
    />
  );
}
