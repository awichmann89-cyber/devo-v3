-- Kosten-Seite bekommt Gruppen + Zwischenüberschriften wie der Material-Tab.
-- Zumietungen: costGroupId/costSortOrder (getrennt von groupId/sortOrder, die
-- die Platzierung freier Zumietungen im Material-Tab steuern).
-- Extrakosten: groupId (kind EXTRA), Reihenfolge über bestehendes sortOrder.

ALTER TABLE "ProjectSubhire" ADD COLUMN "costGroupId" TEXT;
ALTER TABLE "ProjectSubhire" ADD COLUMN "costSortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "ProjectSubhire_costGroupId_idx" ON "ProjectSubhire"("costGroupId");

ALTER TABLE "ProjectSubhire"
  ADD CONSTRAINT "ProjectSubhire_costGroupId_fkey"
  FOREIGN KEY ("costGroupId") REFERENCES "ProjectGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectExtraCost" ADD COLUMN "groupId" TEXT;

CREATE INDEX "ProjectExtraCost_groupId_idx" ON "ProjectExtraCost"("groupId");

ALTER TABLE "ProjectExtraCost"
  ADD CONSTRAINT "ProjectExtraCost_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "ProjectGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: je Projekt mit vorhandenen Zumietungen eine Default-Gruppe anlegen
-- (deterministische IDs über md5, damit die Migration idempotent nachvollziehbar ist).
INSERT INTO "ProjectGroup" ("id", "projectId", "name", "kind", "sortOrder", "discountPercent", "billable", "createdAt", "updatedAt")
SELECT md5('subhire-default:' || p."projectId"), p."projectId", 'Allgemein', 'SUBHIRE', 0, 0, true, now(), now()
FROM (SELECT DISTINCT "projectId" FROM "ProjectSubhire") p;

UPDATE "ProjectSubhire" s
SET "costGroupId" = g."id"
FROM "ProjectGroup" g
WHERE g."projectId" = s."projectId" AND g."kind" = 'SUBHIRE';

-- Bisherige Anzeige-Reihenfolge (sortOrder, createdAt) übernehmen.
UPDATE "ProjectSubhire" s
SET "costSortOrder" = t.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "sortOrder", "createdAt") - 1 AS rn
  FROM "ProjectSubhire"
) t
WHERE t."id" = s."id";

-- Analog für Extrakosten.
INSERT INTO "ProjectGroup" ("id", "projectId", "name", "kind", "sortOrder", "discountPercent", "billable", "createdAt", "updatedAt")
SELECT md5('extra-default:' || p."projectId"), p."projectId", 'Allgemein', 'EXTRA', 0, 0, true, now(), now()
FROM (SELECT DISTINCT "projectId" FROM "ProjectExtraCost") p;

UPDATE "ProjectExtraCost" c
SET "groupId" = g."id"
FROM "ProjectGroup" g
WHERE g."projectId" = c."projectId" AND g."kind" = 'EXTRA';
