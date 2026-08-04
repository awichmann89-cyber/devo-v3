-- Personen können optional an einen Cratel-Login (User) gebunden werden:
-- eingeloggte Nutzer sehen dann ihre eigenen Einsätze auf der Kalender-Seite
-- und bekommen dort das persönliche Personalplanungs-Abo angeboten.
-- 1:1 — ein Account kann höchstens einer Person zugeordnet sein.

ALTER TABLE "Person" ADD COLUMN "userId" TEXT;

CREATE UNIQUE INDEX "Person_userId_key" ON "Person"("userId");

ALTER TABLE "Person"
  ADD CONSTRAINT "Person_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
