"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";
import { projectNoteSchema } from "@/lib/validators";

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

  revalidatePath(`/projects/${projectId}`);
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

  revalidatePath(`/projects/${note.projectId}`);
}

export async function deleteProjectNote(id: string) {
  await requireRole(CAN_WRITE);
  const note = await prisma.projectNote.delete({
    where: { id },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${note.projectId}`);
}
