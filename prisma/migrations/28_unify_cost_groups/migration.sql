-- Zumietungs- und Extrakosten-Gruppen werden zu EINEM Gruppentyp: es gibt auf
-- der Kosten-Seite nur noch `COST`-Gruppen, in die sowohl zugemietetes Material
-- als auch sonstige Extrakosten gebucht werden. Die Positionen unterscheiden
-- sich in der UI nur noch über ihr Icon.
--
-- Migration 18 hat je Projekt eine SUBHIRE- UND eine EXTRA-Gruppe „Allgemein"
-- angelegt — nach dem Umstellen des Typs wären das zwei gleichnamige Gruppen.
-- Deshalb werden gleichnamige Paare vorher verschmolzen.

-- 1. Verschmelzungs-Paare bestimmen: jede EXTRA-Gruppe, für die es im selben
--    Projekt eine gleichnamige SUBHIRE-Gruppe gibt, wandert in diese hinein.
--    `offset` = nächster freier sortOrder der Zielgruppe (über ALLE Item-Typen),
--    damit die einwandernden Positionen hinten anschließen und ihre relative
--    Reihenfolge behalten.
CREATE TEMP TABLE "_cost_group_merge" AS
SELECT DISTINCT ON (e."id")
       e."id" AS extra_id,
       s."id" AS cost_id,
       COALESCE(GREATEST(
         (SELECT MAX(x."costSortOrder") FROM "ProjectSubhire" x WHERE x."costGroupId" = s."id"),
         (SELECT MAX(x."sortOrder") FROM "ProjectExtraCost" x WHERE x."groupId" = s."id"),
         (SELECT MAX(x."sortOrder") FROM "ProjectGroupComment" x WHERE x."groupId" = s."id")
       ), -1) + 1 AS "offset"
FROM "ProjectGroup" e
JOIN "ProjectGroup" s
  ON s."projectId" = e."projectId"
 AND s."kind" = 'SUBHIRE'
 AND lower(btrim(s."name")) = lower(btrim(e."name"))
WHERE e."kind" = 'EXTRA'
ORDER BY e."id", s."sortOrder", s."id";

-- 2. Extrakosten und Zwischenüberschriften in die Zielgruppe umhängen.
UPDATE "ProjectExtraCost" c
SET "groupId" = m.cost_id,
    "sortOrder" = c."sortOrder" + m."offset"
FROM "_cost_group_merge" m
WHERE c."groupId" = m.extra_id;

UPDATE "ProjectGroupComment" k
SET "groupId" = m.cost_id,
    "sortOrder" = k."sortOrder" + m."offset"
FROM "_cost_group_merge" m
WHERE k."groupId" = m.extra_id;

-- 3. Die nun leeren EXTRA-Gruppen löschen (Berechnungszeitraum-Verknüpfungen
--    hängen per Cascade mit dran).
DELETE FROM "ProjectGroup" g
USING "_cost_group_merge" m
WHERE g."id" = m.extra_id;

DROP TABLE "_cost_group_merge";

-- 4. Gruppen-Reihenfolge je Projekt zusammenführen: bisher hatten SUBHIRE- und
--    EXTRA-Gruppen getrennte sortOrder-Räume (beide ab 0). Erst die
--    Zumietungs-, dann die Extrakosten-Gruppen — genau die bisherige Anzeige.
UPDATE "ProjectGroup" g
SET "sortOrder" = t.rn
FROM (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "projectId"
           ORDER BY CASE WHEN "kind" = 'SUBHIRE' THEN 0 ELSE 1 END,
                    "sortOrder", "createdAt", "id"
         ) - 1 AS rn
  FROM "ProjectGroup"
  WHERE "kind" IN ('SUBHIRE', 'EXTRA')
) t
WHERE t."id" = g."id";

-- 5. Enum-Werte SUBHIRE/EXTRA durch COST ersetzen. Postgres kann einzelne
--    Enum-Werte nicht löschen — der Typ wird neu angelegt und die Spalte
--    umgehängt (gleiches Vorgehen wie Migration 22).
ALTER TYPE "ProjectGroupKind" RENAME TO "ProjectGroupKind_old";
CREATE TYPE "ProjectGroupKind" AS ENUM ('MATERIAL', 'SERVICE', 'COST');
ALTER TABLE "ProjectGroup"
  ALTER COLUMN "kind" TYPE "ProjectGroupKind"
  USING (
    CASE
      WHEN "kind"::text IN ('SUBHIRE', 'EXTRA') THEN 'COST'
      ELSE "kind"::text
    END::"ProjectGroupKind"
  );
DROP TYPE "ProjectGroupKind_old";
