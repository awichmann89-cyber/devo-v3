"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { projectNoteSchema } from "@/lib/validators";
import { toggleTaskLine } from "@/lib/markdown-tasks";

/**
 * Aufgaben auf /tasks werden aus den Notizen abgeleitet — jede Änderung an
 * einer Notiz muss die Seite deshalb mit erneuern.
 */
function revalidateNote(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
}

export async function createProjectNote(projectId: string, input: unknown) {
  await requireRole(CAN_WRITE);
  const data = projectNoteSchema.parse(input);

  await prisma.projectNote.create({
    data: {
      projectId,
      title: data.title.trim(),
      content: data.content,
    },
    select: { id: true },
  });

  revalidateNote(projectId);
}

export async function updateProjectNote(id: string, input: unknown) {
  await requireRole(CAN_WRITE);
  const data = projectNoteSchema.parse(input);

  const note = await prisma.projectNote.update({
    where: { id },
    data: {
      title: data.title.trim(),
      content: data.content,
    },
    select: { projectId: true },
  });

  revalidateNote(note.projectId);
}

/**
 * Hakt eine einzelne Aufgabe in einer Notiz ab, ohne den Editor zu öffnen.
 *
 * `line` ist die 1-basierte Zeile im Markdown-Quelltext, die die Vorschau zur
 * angeklickten Checkbox gemeldet hat. Der Inhalt wird serverseitig frisch
 * gelesen — passt die Zeile nicht mehr, wurde die Notiz zwischenzeitlich
 * geändert und wir schreiben lieber nichts.
 */
export async function toggleProjectNoteTask(
  id: string,
  line: number,
  checked: boolean
) {
  await requireRole(CAN_WRITE);

  const note = await prisma.projectNote.findUnique({
    where: { id },
    select: { projectId: true, content: true },
  });
  if (!note) throw new Error("Notiz nicht gefunden");

  const content = toggleTaskLine(note.content, line, checked);
  if (content === null) {
    throw new Error(
      "Die Notiz wurde zwischenzeitlich geändert. Bitte die Seite neu laden."
    );
  }

  await prisma.projectNote.update({
    where: { id },
    data: { content },
    select: { id: true },
  });

  revalidateNote(note.projectId);
}

export async function deleteProjectNote(id: string) {
  await requireRole(CAN_WRITE);
  const note = await prisma.projectNote.delete({
    where: { id },
    select: { projectId: true },
  });
  revalidateNote(note.projectId);
}
