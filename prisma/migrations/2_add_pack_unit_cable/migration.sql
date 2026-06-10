-- Kabel als Inhalt von Packeinheiten (analog zu PackUnitDevice)
CREATE TABLE "PackUnitCable" (
    "id" TEXT NOT NULL,
    "packUnitId" TEXT NOT NULL,
    "cableId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PackUnitCable_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PackUnitCable_packUnitId_cableId_key" ON "PackUnitCable"("packUnitId", "cableId");
CREATE INDEX "PackUnitCable_packUnitId_idx" ON "PackUnitCable"("packUnitId");
CREATE INDEX "PackUnitCable_cableId_idx" ON "PackUnitCable"("cableId");

ALTER TABLE "PackUnitCable" ADD CONSTRAINT "PackUnitCable_packUnitId_fkey"
  FOREIGN KEY ("packUnitId") REFERENCES "PackUnit"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PackUnitCable" ADD CONSTRAINT "PackUnitCable_cableId_fkey"
  FOREIGN KEY ("cableId") REFERENCES "Cable"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
