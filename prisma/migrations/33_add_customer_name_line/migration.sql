-- Zweite Namenszeile im Empfängerblock.
--
-- `Customer.nameLines` ist die Auswahlliste pro Kunde (z.B. „Kulturamt",
-- „c/o Stadthalle"). Das Projekt speichert die gewählte Zeile als Text in
-- `Project.customerNameLine`; sie gilt für alle Dokumente des Projekts.
--
-- Kein Backfill: leer = keine zweite Zeile (Verhalten wie bisher). Bereits
-- geschriebene Dokument-Snapshots bleiben unverändert.

ALTER TABLE "Customer" ADD COLUMN "nameLines" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Project" ADD COLUMN "customerNameLine" TEXT;
