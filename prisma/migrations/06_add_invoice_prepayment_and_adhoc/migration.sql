-- AlterTable: Invoice mit Vorkasse-Flag
ALTER TABLE "Invoice"
  ADD COLUMN "isPrepayment" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: ProjectAdHocItem für freie Positionen
CREATE TABLE "ProjectAdHocItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectAdHocItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectAdHocItem_projectId_idx" ON "ProjectAdHocItem"("projectId");
CREATE INDEX "ProjectAdHocItem_groupId_idx" ON "ProjectAdHocItem"("groupId");

-- AddForeignKey
ALTER TABLE "ProjectAdHocItem"
  ADD CONSTRAINT "ProjectAdHocItem_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectAdHocItem"
  ADD CONSTRAINT "ProjectAdHocItem_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "ProjectGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
