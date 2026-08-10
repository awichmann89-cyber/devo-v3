-- Einmaliger Fix für BESTEHENDE Datenbanken.
--
-- Hintergrund: Die Migrationsordner 0_… bis 9_… wurden auf zweistellige Namen
-- (00_… bis 09_…) umbenannt. Prisma sortiert Migrationen lexikographisch —
-- ohne führende Null lief `16_add_subhire_adhoc_link` vor
-- `06_add_invoice_prepayment_and_adhoc`, was auf einer frischen Datenbank mit
-- `ERROR: relation "ProjectAdHocItem" does not exist` (P3018) abbricht.
--
-- In bereits migrierten Datenbanken stehen in `_prisma_migrations` noch die
-- alten Namen. Ohne diesen Fix hält Prisma die zehn umbenannten Migrationen für
-- neu und versucht sie erneut anzuwenden — der nächste Deploy schlägt fehl.
--
-- Anwenden VOR dem ersten Deploy des Umbenennungs-Commits, z. B.:
--   psql "$DIRECT_URL" -f scripts/fix-migration-names.sql
--
-- Idempotent: ein zweiter Lauf findet keine alten Namen mehr und ändert nichts.
-- Die Checksummen bleiben gültig, da sich der Inhalt der migration.sql-Dateien
-- nicht geändert hat — nur die Ordnernamen.

BEGIN;

UPDATE "_prisma_migrations" m
SET migration_name = r.neu
FROM (VALUES
  ('0_baseline',                        '00_baseline'),
  ('1_add_project_maintainer',          '01_add_project_maintainer'),
  ('2_add_pack_unit_cable',             '02_add_pack_unit_cable'),
  ('3_add_cable_group_kind',            '03_add_cable_group_kind'),
  ('4_add_project_file',                '04_add_project_file'),
  ('5_add_invoice_kind',                '05_add_invoice_kind'),
  ('6_add_invoice_prepayment_and_adhoc','06_add_invoice_prepayment_and_adhoc'),
  ('7_add_quote_notes',                 '07_add_quote_notes'),
  ('8_add_sortorder_and_comments',      '08_add_sortorder_and_comments'),
  ('9_add_document_snapshot',           '09_add_document_snapshot')
) AS r(alt, neu)
WHERE m.migration_name = r.alt;

COMMIT;

-- Kontrolle: sollte 27 Zeilen liefern, alle mit zweistelligem Präfix und
-- gefülltem finished_at (= erfolgreich angewendet).
SELECT migration_name, finished_at, rolled_back_at
FROM "_prisma_migrations"
ORDER BY migration_name;
