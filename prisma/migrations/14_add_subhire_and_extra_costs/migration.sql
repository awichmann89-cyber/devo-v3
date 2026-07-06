-- Zumietfunktion + Zusatzkosten-Tracking
--
-- Rein interne Kostenschicht — beeinflusst NICHT Angebote/Rechnungen/Packliste
-- und wird von calculateProjectTotal / buildSnapshotFromProject nicht gelesen.
--
--   * ProjectSubhire  — zugemietetes Material (optional mit Gerät/Gruppe verknüpft)
--   * ProjectExtraCost — sonstige / personaltechnische Extrakosten

-- CreateEnum
CREATE TYPE "ExtraCostKind" AS ENUM ('PERSONAL', 'SONSTIGES');

-- CreateTable
CREATE TABLE "ProjectSubhire" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "deviceId" TEXT,
    "groupId" TEXT,
    "name" TEXT NOT NULL,
    "supplier" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitCost" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectSubhire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectExtraCost" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "ExtraCostKind" NOT NULL DEFAULT 'SONSTIGES',
    "amount" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectExtraCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectSubhire_projectId_idx" ON "ProjectSubhire"("projectId");

-- CreateIndex
CREATE INDEX "ProjectSubhire_deviceId_idx" ON "ProjectSubhire"("deviceId");

-- CreateIndex
CREATE INDEX "ProjectSubhire_groupId_idx" ON "ProjectSubhire"("groupId");

-- CreateIndex
CREATE INDEX "ProjectExtraCost_projectId_idx" ON "ProjectExtraCost"("projectId");

-- AddForeignKey
ALTER TABLE "ProjectSubhire" ADD CONSTRAINT "ProjectSubhire_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSubhire" ADD CONSTRAINT "ProjectSubhire_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSubhire" ADD CONSTRAINT "ProjectSubhire_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ProjectGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectExtraCost" ADD CONSTRAINT "ProjectExtraCost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
