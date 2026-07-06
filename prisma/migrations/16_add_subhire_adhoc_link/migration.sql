-- Zumietungen können zusätzlich zu Katalog-Geräten auch mit Ad-hoc-Positionen
-- („Vorübergehendes Gerät") verknüpft werden. Ist gesetzt, wird die Ad-hoc-Zeile
-- auf der Materialseite blau markiert.

ALTER TABLE "ProjectSubhire"
  ADD COLUMN "adHocItemId" TEXT;

CREATE INDEX "ProjectSubhire_adHocItemId_idx" ON "ProjectSubhire"("adHocItemId");

ALTER TABLE "ProjectSubhire"
  ADD CONSTRAINT "ProjectSubhire_adHocItemId_fkey"
  FOREIGN KEY ("adHocItemId") REFERENCES "ProjectAdHocItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
