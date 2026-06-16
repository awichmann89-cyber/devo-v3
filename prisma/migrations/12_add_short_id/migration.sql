-- shortId-Spalten für Device und PackUnit.
-- Die kompakten Tokens werden im QR-Code statt der vollen cuid verwendet —
-- bringt den QR-Code von Version 4 auf Version 2 (33% kleinere Codes,
-- 50% größere Einzelmodule bei gleicher Druckgröße).
--
-- Backfill: wir nehmen die letzten 8 Zeichen der bestehenden cuid und
-- machen sie uppercase. cuids haben einen zufälligen Schwanz, da sind
-- Kollisionen bei realistischen Bestandsgrößen praktisch ausgeschlossen
-- (36^8 ≈ 2,8 Billionen Permutationen).

-- 1) Spalten anlegen, zunächst nullable für Backfill
ALTER TABLE "Device"   ADD COLUMN "shortId" TEXT;
ALTER TABLE "PackUnit" ADD COLUMN "shortId" TEXT;

-- 2) Backfill aus dem cuid-Tail
UPDATE "Device"   SET "shortId" = upper(right("id", 8)) WHERE "shortId" IS NULL;
UPDATE "PackUnit" SET "shortId" = upper(right("id", 8)) WHERE "shortId" IS NULL;

-- 3) NOT NULL + UNIQUE
ALTER TABLE "Device"   ALTER COLUMN "shortId" SET NOT NULL;
ALTER TABLE "PackUnit" ALTER COLUMN "shortId" SET NOT NULL;

CREATE UNIQUE INDEX "Device_shortId_key"   ON "Device"   ("shortId");
CREATE UNIQUE INDEX "PackUnit_shortId_key" ON "PackUnit" ("shortId");
