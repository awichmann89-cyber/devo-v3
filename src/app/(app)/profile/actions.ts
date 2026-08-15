"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";

/**
 * Speichert die persönliche E-Mail-Signatur (Tiptap-HTML) des angemeldeten
 * Nutzers. Wird beim Versand von Angebots-/Rechnungs-Mails unter den
 * Nachrichtentext gesetzt (siehe sendDocumentEmail in src/lib/email.ts).
 */
export async function saveSignature(html: string) {
  const session = await requireAuth();
  const cleaned = (html ?? "").slice(0, 4000);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { signatureHtml: cleaned },
  });
  revalidatePath("/profile");
}
