"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { ANNOUNCEMENTS } from "@/lib/announcements";

/** Markiert alle Ankündigungen bis einschließlich `id` als gesehen. */
export async function markAnnouncementSeen(id: string) {
  const session = await requireAuth();
  if (!ANNOUNCEMENTS.some((a) => a.id === id)) return;
  await prisma.user.update({
    where: { id: session.user.id },
    data: { seenAnnouncementId: id },
  });
}
