-- Überfälligkeits-Benachrichtigung: Zeitpunkt, zu dem der Projekt-
-- Verantwortliche über die überschrittene Zahlungsfrist einer Rechnung
-- informiert wurde (Cron /api/cron/overdue-invoices). Null = noch nicht
-- benachrichtigt — verhindert Mehrfach-Mails.

ALTER TABLE "Invoice"
  ADD COLUMN "overdueNotifiedAt" TIMESTAMP(3);
