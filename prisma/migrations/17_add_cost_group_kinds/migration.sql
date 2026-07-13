-- Neue Gruppen-Typen für die Kosten-Seite:
-- SUBHIRE → Zugemietetes Material, EXTRA → Personal & Sonstiges.
-- Eigene Migration, weil neue Enum-Werte in Postgres nicht in derselben
-- Transaktion verwendet werden können, in der sie angelegt wurden.

ALTER TYPE "ProjectGroupKind" ADD VALUE 'SUBHIRE';
ALTER TYPE "ProjectGroupKind" ADD VALUE 'EXTRA';
