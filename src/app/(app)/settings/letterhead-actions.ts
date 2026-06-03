"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_ADMIN } from "@/lib/auth-helpers";
import { LetterheadKind } from "@prisma/client";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function uploadLetterhead(
  kind: LetterheadKind,
  formData: FormData
) {
  await requireRole(CAN_ADMIN);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Keine Datei ausgewählt.");
  }
  if (file.type !== "application/pdf") {
    throw new Error("Nur PDF-Dateien sind erlaubt.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Datei zu groß (max. 10 MB).");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  await prisma.letterheadTemplate.upsert({
    where: { kind },
    update: { fileName: file.name, mimeType: file.type, data: buffer },
    create: {
      kind,
      fileName: file.name,
      mimeType: file.type,
      data: buffer,
    },
  });
  revalidatePath("/settings");
}

export async function deleteLetterhead(kind: LetterheadKind) {
  await requireRole(CAN_ADMIN);
  await prisma.letterheadTemplate.delete({ where: { kind } }).catch(() => null);
  revalidatePath("/settings");
}
