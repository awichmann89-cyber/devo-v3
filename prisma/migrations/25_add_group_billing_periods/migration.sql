-- Berechnungszeiträume werden zu wählbaren Projekt-Phasen:
-- 1) M:N Gruppe ↔ Berechnungszeitraum ("_GroupBillingPeriods"):
--    MATERIAL-Gruppen rechnen ihren Tagesfaktor nur über die gewählten
--    Zeiträume (keine Auswahl = alle, wie bisher); SERVICE-Gruppen nutzen
--    sie als Planungsgrundlage für Personal-Einsätze. So kann z.B. ein
--    Aufbautag mit Personal beplant werden, ohne dass Material dafür
--    berechnet wird.
-- 2) PersonAssignment.billingPeriodId: Einsätze ohne explizite Uhrzeiten
--    laufen ganztägig über den gewählten Zeitraum (Fallback: Planungszeitraum).

CREATE TABLE "_GroupBillingPeriods" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX "_GroupBillingPeriods_AB_unique" ON "_GroupBillingPeriods"("A", "B");
CREATE INDEX "_GroupBillingPeriods_B_index" ON "_GroupBillingPeriods"("B");

ALTER TABLE "_GroupBillingPeriods"
  ADD CONSTRAINT "_GroupBillingPeriods_A_fkey"
  FOREIGN KEY ("A") REFERENCES "BillingPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_GroupBillingPeriods"
  ADD CONSTRAINT "_GroupBillingPeriods_B_fkey"
  FOREIGN KEY ("B") REFERENCES "ProjectGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PersonAssignment" ADD COLUMN "billingPeriodId" TEXT;

CREATE INDEX "PersonAssignment_billingPeriodId_idx" ON "PersonAssignment"("billingPeriodId");

ALTER TABLE "PersonAssignment"
  ADD CONSTRAINT "PersonAssignment_billingPeriodId_fkey"
  FOREIGN KEY ("billingPeriodId") REFERENCES "BillingPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
