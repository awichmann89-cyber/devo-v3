-- Kabel auf der digitalen Packliste abhaken. Kabel tragen keinen QR-Code,
-- die Einträge entstehen daher durch manuelles Antippen (scannedCode = 'MANUELL').
ALTER TABLE "PackingScan" ADD COLUMN "cableId" TEXT;

CREATE INDEX "PackingScan_cableId_idx" ON "PackingScan"("cableId");

ALTER TABLE "PackingScan" ADD CONSTRAINT "PackingScan_cableId_fkey"
  FOREIGN KEY ("cableId") REFERENCES "Cable"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
