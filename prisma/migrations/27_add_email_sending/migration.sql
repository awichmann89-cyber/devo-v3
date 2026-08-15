-- Versand von Angebots-/Rechnungs-PDFs per E-Mail direkt aus der App:
-- persönliche E-Mail-Signatur pro Nutzer sowie Versand-Tracking
-- (Zeitpunkt/Empfänger) auf Angeboten und Rechnungen.

ALTER TABLE "User"
  ADD COLUMN "signatureHtml" TEXT;

ALTER TABLE "Quote"
  ADD COLUMN "emailSentAt" TIMESTAMP(3),
  ADD COLUMN "emailSentTo" TEXT;

ALTER TABLE "Invoice"
  ADD COLUMN "emailSentAt" TIMESTAMP(3),
  ADD COLUMN "emailSentTo" TEXT;
