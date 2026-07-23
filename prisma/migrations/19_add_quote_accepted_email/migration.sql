-- Quote-Acceptance: E-Mail-Adresse des Annehmenden
--
-- Der Kunde gibt beim Annehmen des Angebots seine E-Mail-Adresse an und
-- erhält dorthin eine automatische Bestätigung (Versand via Resend).

ALTER TABLE "Quote"
  ADD COLUMN "acceptedByEmail" TEXT;
