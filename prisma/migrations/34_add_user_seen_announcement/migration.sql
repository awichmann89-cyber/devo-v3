-- „Was ist neu"-Dialog: merkt sich pro Nutzer die zuletzt gesehene
-- Ankündigung (Id aus src/lib/announcements.ts). NULL = noch keine gesehen,
-- dann erscheint beim nächsten Seitenaufruf nur die neueste.

ALTER TABLE "User" ADD COLUMN "seenAnnouncementId" TEXT;
