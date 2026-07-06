-- Vorkasse-/Anzahlungsrechnungen mit Prozentsatz + Schlussrechnung mit Abzug
--
--   * prepaymentPercent — bei Vorkasse-Rechnungen der Anteil des Gesamtauftrags
--     (totalNet/totalGross enthalten dann den anteiligen Betrag).
--   * deductions — bei Schlussrechnungen die abgezogenen Vorkasse-Rechnungen als
--     JSON ([{ number, netAmount, grossAmount }]); totalNet/totalGross = Rest.

ALTER TABLE "Invoice"
  ADD COLUMN "prepaymentPercent" DECIMAL(5,2),
  ADD COLUMN "deductions"        JSONB;
