-- Quote-Acceptance + Supersession
--
-- Acceptance:
--   * acceptToken — Random-Token für die Public-URL /angebot/<token>
--   * acceptedAt + acceptedByName + acceptedSignaturePng (base64) + IP + UA
--     für die digitale Annahmeerklärung
--
-- Supersession:
--   * supersededByQuoteId — selbst-referenzieller FK; wenn gesetzt, ist
--     dieses Angebot durch ein neueres ersetzt worden. Beim "Überschreiben"
--     im Finanzen-Dialog wird nun nicht mehr gelöscht, sondern dieser
--     Pointer gesetzt, damit der alte Token weiter funktioniert und auf
--     die aktuelle Version weiterleiten kann.

ALTER TABLE "Quote"
  ADD COLUMN "acceptToken"          TEXT,
  ADD COLUMN "acceptedAt"           TIMESTAMP(3),
  ADD COLUMN "acceptedByName"       TEXT,
  ADD COLUMN "acceptedSignaturePng" TEXT,
  ADD COLUMN "acceptedIp"           TEXT,
  ADD COLUMN "acceptedUserAgent"    TEXT,
  ADD COLUMN "supersededByQuoteId"  TEXT;

CREATE UNIQUE INDEX "Quote_acceptToken_key"     ON "Quote" ("acceptToken");
CREATE INDEX        "Quote_supersededByQuoteId" ON "Quote" ("supersededByQuoteId");

ALTER TABLE "Quote"
  ADD CONSTRAINT "Quote_supersededByQuoteId_fkey"
  FOREIGN KEY ("supersededByQuoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
