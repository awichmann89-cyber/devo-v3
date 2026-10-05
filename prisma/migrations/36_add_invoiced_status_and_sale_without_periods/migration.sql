-- Neuer Projekt-Status „Abgerechnet": wird gesetzt, sobald eine (Schluss-)
-- Rechnung versendet ist — per E-Mail aus der App oder manuell markiert.
-- Nach Zahlungseingang geht es wie bisher automatisch auf COMPLETED.
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'INVOICED' BEFORE 'COMPLETED';

-- Versand-Zeitpunkt einer Rechnung unabhängig vom Weg (E-Mail aus der App,
-- Post, eigenes Mailprogramm). emailSentAt bleibt der reine App-E-Mail-Versand.
ALTER TABLE "Invoice" ADD COLUMN "sentAt" TIMESTAMP(3);
UPDATE "Invoice" SET "sentAt" = "emailSentAt" WHERE "emailSentAt" IS NOT NULL;

-- Verkaufsprojekte haben keine Zeiträume mehr: Planungszeitraum = Erstellungs-
-- datum (damit sortiert die Projektliste sie danach ein), Berechnungszeiträume
-- entfallen. Gruppen und Einsätze verlieren nur die Verknüpfung (SET NULL bzw.
-- implizite m:n-Tabelle).
UPDATE "Project"
SET "planningStart" = "createdAt", "planningEnd" = "createdAt"
WHERE "kind" = 'VERKAUF';

DELETE FROM "BillingPeriod"
WHERE "projectId" IN (SELECT "id" FROM "Project" WHERE "kind" = 'VERKAUF');
