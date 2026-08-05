-- Vergütungsart pro Einsatz: neben der Pauschale (agreedRate) kann ein
-- Freelancer-Einsatz jetzt nach Stunden vergütet werden (hourlyRate).
-- Erfasste Zeiten des Einsatzes bekommen den Satz als hourlyWageSnapshot —
-- die bestehende Kostenlogik (Stunden × Snapshot) greift dann automatisch.

ALTER TABLE "PersonAssignment" ADD COLUMN "hourlyRate" DECIMAL(10,2);
