-- sortOrder-Spalten für Drag&Drop in Material/Service-Tabellen
ALTER TABLE "ProjectAssignment"
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProjectCableAssignment"
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProjectService"
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Kommentar-Zeilen innerhalb einer Gruppe
CREATE TABLE "ProjectGroupComment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectGroupComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectGroupComment_projectId_idx" ON "ProjectGroupComment"("projectId");
CREATE INDEX "ProjectGroupComment_groupId_idx" ON "ProjectGroupComment"("groupId");

ALTER TABLE "ProjectGroupComment"
  ADD CONSTRAINT "ProjectGroupComment_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectGroupComment"
  ADD CONSTRAINT "ProjectGroupComment_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "ProjectGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Bestehenden Daten initial einen sinnvollen sortOrder geben (nach createdAt)
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "groupId" ORDER BY "createdAt") - 1 AS rn
  FROM "ProjectAssignment"
)
UPDATE "ProjectAssignment" pa SET "sortOrder" = ordered.rn
FROM ordered WHERE pa.id = ordered.id;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "groupId" ORDER BY "createdAt") - 1 AS rn
  FROM "ProjectCableAssignment"
)
UPDATE "ProjectCableAssignment" pa SET "sortOrder" = ordered.rn
FROM ordered WHERE pa.id = ordered.id;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "groupId" ORDER BY "createdAt") - 1 AS rn
  FROM "ProjectService"
)
UPDATE "ProjectService" ps SET "sortOrder" = ordered.rn
FROM ordered WHERE ps.id = ordered.id;
