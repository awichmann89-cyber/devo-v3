-- Snapshot der Render-Daten zum Zeitpunkt der Erstellung. Sobald gesetzt,
-- wird das PDF aus dem Snapshot gerendert statt aus den Live-Projektdaten —
-- nachträgliche Projekt-Änderungen verändern die ausgegebene Rechnung/das
-- Angebot dann nicht mehr (GoBD-/§14 UStG-konform).
ALTER TABLE "Invoice" ADD COLUMN "snapshot" JSONB;
ALTER TABLE "Quote"   ADD COLUMN "snapshot" JSONB;
