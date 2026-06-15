-- Folge-Migration zu 10_allow_duplicate_assignments.
--
-- In der baseline (0_baseline) wurden die Uniques als UNIQUE INDEX angelegt,
-- nicht als CONSTRAINT — das DROP CONSTRAINT IF EXISTS in Migration 10 lief
-- daher als No-Op durch und Postgres erzwingt die Eindeutigkeit weiterhin
-- (P2002 beim Anlegen einer zweiten Buchung desselben Geräts/Kabels).
--
-- Hier droppen wir den Index direkt. Zusätzlich noch das CONSTRAINT-Drop,
-- damit die Migration auch auf Setups funktioniert, bei denen Prisma in
-- einer anderen Version die Uniques als CONSTRAINT angelegt hätte.
DROP INDEX IF EXISTS "ProjectAssignment_projectId_deviceId_key";
DROP INDEX IF EXISTS "ProjectCableAssignment_projectId_cableId_key";

ALTER TABLE "ProjectAssignment"      DROP CONSTRAINT IF EXISTS "ProjectAssignment_projectId_deviceId_key";
ALTER TABLE "ProjectCableAssignment" DROP CONSTRAINT IF EXISTS "ProjectCableAssignment_projectId_cableId_key";
