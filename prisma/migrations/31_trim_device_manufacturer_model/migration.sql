-- Hersteller/Modell wurden bis hierher ungetrimmt gespeichert (deviceSchema
-- hatte kein .trim()), der daraus abgeleitete `name` dagegen aus getrimmten
-- Werten gebaut. Ein angehängtes Leerzeichen am Hersteller ergab damit
-- "MA Lighting" + " " + " grandMA3" != "MA Lighting grandMA3" — und Angebot,
-- Rechnung sowie Angebots-Webansicht druckten Hersteller/Modell als zweite
-- Zeile unter die identische Bezeichnung.
--
-- Nur eine Datenbereinigung, kein Schema-Change: Whitespace-Folgen erst auf
-- ein Leerzeichen zusammenziehen (deckt auch Tabs/Umbrüche ab), dann die
-- Ränder abschneiden. Leere Hersteller/Modell werden zu NULL (wie normalize()
-- in devices/actions.ts), ein leer gewordener Name fällt auf "Gerät" zurück
-- (wie device-dialog.tsx).
--
-- POSIX-Klasse [[:space:]] statt \s, damit das Ergebnis nicht von
-- standard_conforming_strings abhängt.
--
-- Bereits geschriebene Dokument-Snapshots behalten die alten Werte — die
-- fängt deviceRowLabel() in lib/labels.ts zur Laufzeit ab.

UPDATE "Device"
SET
  "manufacturer" = NULLIF(btrim(regexp_replace("manufacturer", '[[:space:]]+', ' ', 'g')), ''),
  "model"        = NULLIF(btrim(regexp_replace("model", '[[:space:]]+', ' ', 'g')), ''),
  "name"         = COALESCE(NULLIF(btrim(regexp_replace("name", '[[:space:]]+', ' ', 'g')), ''), 'Gerät')
WHERE
  "manufacturer" IS DISTINCT FROM NULLIF(btrim(regexp_replace("manufacturer", '[[:space:]]+', ' ', 'g')), '')
  OR "model" IS DISTINCT FROM NULLIF(btrim(regexp_replace("model", '[[:space:]]+', ' ', 'g')), '')
  OR "name" IS DISTINCT FROM COALESCE(NULLIF(btrim(regexp_replace("name", '[[:space:]]+', ' ', 'g')), ''), 'Gerät');
