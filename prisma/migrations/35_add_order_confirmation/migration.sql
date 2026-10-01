-- Auftragsbestätigungen: eigener Dokumenttyp neben Angebot und Rechnung.
-- Nummernkreis und Texte liegen wie beim Angebot in "Setting"
-- (orderConfirmationNumber*, orderConfirmation*Text) — kein Backfill nötig.

CREATE TABLE "OrderConfirmation" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "quoteId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalNet" DECIMAL(10,2) NOT NULL,
    "totalGross" DECIMAL(10,2),
    "vatPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "snapshot" JSONB,
    "emailSentAt" TIMESTAMP(3),
    "emailSentTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderConfirmation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderConfirmation_number_key" ON "OrderConfirmation"("number");
CREATE INDEX "OrderConfirmation_projectId_idx" ON "OrderConfirmation"("projectId");
CREATE INDEX "OrderConfirmation_date_idx" ON "OrderConfirmation"("date");
CREATE INDEX "OrderConfirmation_quoteId_idx" ON "OrderConfirmation"("quoteId");

ALTER TABLE "OrderConfirmation" ADD CONSTRAINT "OrderConfirmation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderConfirmation" ADD CONSTRAINT "OrderConfirmation_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
