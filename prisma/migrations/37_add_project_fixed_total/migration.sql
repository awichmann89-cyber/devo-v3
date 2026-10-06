-- Festpreis: Ist "fixedTotalNet" gesetzt, wird der projektweite Rabatt nicht
-- mehr aus "discountPercent" genommen, sondern so berechnet, dass das
-- Gesamt netto diesem Wert entspricht (nie unter 0 %).
ALTER TABLE "Project" ADD COLUMN "fixedTotalNet" DECIMAL(12,2);
