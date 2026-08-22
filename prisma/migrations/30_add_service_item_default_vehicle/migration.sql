-- Standard-Fuhrpark-Einheit je Transport-Position: beim Buchen der Position
-- wird die Einheit automatisch eingeplant (siehe addProjectService).
-- SetNull, damit das Löschen einer Einheit die Katalog-Position nicht mitnimmt.

ALTER TABLE "ServiceItem" ADD COLUMN "defaultVehicleId" TEXT;

CREATE INDEX "ServiceItem_defaultVehicleId_idx" ON "ServiceItem"("defaultVehicleId");

ALTER TABLE "ServiceItem"
  ADD CONSTRAINT "ServiceItem_defaultVehicleId_fkey"
  FOREIGN KEY ("defaultVehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
