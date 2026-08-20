-- Fuhrpark: Fahrzeuge und Anhänger als Stammdaten (Vehicle, Einzelstücke) und
-- ihre Einsätze an Transport-Positionen (VehicleAssignment, Cascade an
-- ProjectService wie PersonAssignment). Der Einsatz blockt die Einheit — ohne
-- eigene Zeitangaben über den gesamten Projekt-Planungszeitraum.
--
-- Zusätzlich: Transportfunktionen werden immer pauschal gerechnet, bestehende
-- Katalog-Einträge werden entsprechend auf FLAT gezogen.

CREATE TYPE "VehicleKind" AS ENUM ('FAHRZEUG', 'ANHAENGER');

CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "VehicleKind" NOT NULL DEFAULT 'FAHRZEUG',
    "licensePlate" TEXT,
    "loadCapacityKg" INTEGER,
    "grossWeightKg" INTEGER,
    "requiredLicense" TEXT,
    "nextInspection" TIMESTAMP(3),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Vehicle_name_key" ON "Vehicle"("name");
CREATE INDEX "Vehicle_active_idx" ON "Vehicle"("active");
CREATE INDEX "Vehicle_kind_idx" ON "Vehicle"("kind");

CREATE TABLE "VehicleAssignment" (
    "id" TEXT NOT NULL,
    "projectServiceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "billingPeriodId" TEXT,
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "driverId" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VehicleAssignment_projectServiceId_idx" ON "VehicleAssignment"("projectServiceId");
CREATE INDEX "VehicleAssignment_projectId_idx" ON "VehicleAssignment"("projectId");
CREATE INDEX "VehicleAssignment_vehicleId_idx" ON "VehicleAssignment"("vehicleId");
CREATE INDEX "VehicleAssignment_billingPeriodId_idx" ON "VehicleAssignment"("billingPeriodId");
CREATE INDEX "VehicleAssignment_driverId_idx" ON "VehicleAssignment"("driverId");

ALTER TABLE "VehicleAssignment"
  ADD CONSTRAINT "VehicleAssignment_projectServiceId_fkey"
  FOREIGN KEY ("projectServiceId") REFERENCES "ProjectService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VehicleAssignment"
  ADD CONSTRAINT "VehicleAssignment_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VehicleAssignment"
  ADD CONSTRAINT "VehicleAssignment_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VehicleAssignment"
  ADD CONSTRAINT "VehicleAssignment_billingPeriodId_fkey"
  FOREIGN KEY ("billingPeriodId") REFERENCES "BillingPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VehicleAssignment"
  ADD CONSTRAINT "VehicleAssignment_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Transportfunktionen immer pauschal (Katalog-Bestand angleichen).
UPDATE "ServiceItem" SET "unit" = 'FLAT' WHERE "kind" = 'TRANSPORT' AND "unit" <> 'FLAT';
