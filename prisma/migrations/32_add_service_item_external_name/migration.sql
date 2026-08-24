-- Interne vs. externe Bezeichnung einer Personal-/Transport-Position.
--
-- `name` bleibt die interne, eindeutige Bezeichnung (Katalog, Projekt,
-- Personal- und Fuhrparkplanung). `externalName` ist die Bezeichnung, die auf
-- Angebot, Rechnung und in der Angebots-Webansicht gedruckt wird.
--
-- NULL/leer = die interne Bezeichnung wird gedruckt (Verhalten wie bisher),
-- deshalb kein Backfill. Bewusst ohne Unique-Constraint: mehrere interne
-- Positionen dürfen beim Kunden unter derselben Bezeichnung erscheinen.
--
-- Bereits geschriebene Dokument-Snapshots behalten ihre Bezeichnung — sie
-- friert buildSnapshotFromProject beim Ausgeben des Dokuments ein.

ALTER TABLE "ServiceItem" ADD COLUMN "externalName" TEXT;
