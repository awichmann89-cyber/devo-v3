-- Kabel-Gruppen werden zu Material-Gruppen: es gibt nur noch EINEN Gruppentyp
-- im Material-Tab, Kabel können in jede Material-Gruppe gebucht werden.
--
-- 1. Bestehende CABLE-Gruppen auf MATERIAL umstellen.
--    * sortOrder wird hinter die vorhandenen Material-Gruppen des Projekts
--      geschoben, damit die Reihenfolge (erst Material, dann Kabel) erhalten
--      bleibt und keine Kollisionen entstehen.
--    * billable = false, weil Kabel-Gruppen bisher NIE auf Angeboten/Rechnungen
--      erschienen sind. So bleibt das Dokument-Verhalten identisch; wer die
--      Gruppe künftig abrechnen will, kann den Haken im Gruppen-Dialog setzen.
UPDATE "ProjectGroup" g
SET "kind" = 'MATERIAL',
    "billable" = false,
    "sortOrder" = g."sortOrder" + COALESCE(
      (
        SELECT MAX(m."sortOrder") + 1
        FROM "ProjectGroup" m
        WHERE m."projectId" = g."projectId" AND m."kind" = 'MATERIAL'
      ),
      0
    )
WHERE g."kind" = 'CABLE';

-- 2. Enum-Wert CABLE entfernen. Postgres kann einzelne Enum-Werte nicht
--    löschen — der Typ wird neu angelegt und die Spalte umgehängt.
ALTER TYPE "ProjectGroupKind" RENAME TO "ProjectGroupKind_old";
CREATE TYPE "ProjectGroupKind" AS ENUM ('MATERIAL', 'SERVICE', 'SUBHIRE', 'EXTRA');
ALTER TABLE "ProjectGroup"
  ALTER COLUMN "kind" TYPE "ProjectGroupKind"
  USING ("kind"::text::"ProjectGroupKind");
DROP TYPE "ProjectGroupKind_old";
