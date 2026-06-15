-- Unique-Constraints aufheben, damit dasselbe Gerät bzw. Kabel mehrfach in
-- ein Projekt gebucht werden kann (z.B. einmal in Gruppe A, einmal in Gruppe B).
-- Lager-/Konflikt-Berechnung summiert weiterhin über alle Buchungen.
ALTER TABLE "ProjectAssignment"      DROP CONSTRAINT IF EXISTS "ProjectAssignment_projectId_deviceId_key";
ALTER TABLE "ProjectCableAssignment" DROP CONSTRAINT IF EXISTS "ProjectCableAssignment_projectId_cableId_key";
