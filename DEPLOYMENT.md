# Deployment — eine Instanz pro Unternehmen

Diese App wird **pro Kunde als eigene Instanz** betrieben: eigenes Vercel-Projekt,
eigene Datenbank, eigener Blob-Store, eigene Domain. Alle Instanzen laufen aus
demselben Git-Repository.

## Warum keine Mandantenfähigkeit

Das Datenmodell kennt keine Mandanten. Es gibt keine `tenantId`, und mehrere
Unique-Constraints sind global:

- `Location.name @unique` und `Category.name @unique` — zwei Kunden könnten nicht
  beide ein „Hauptlager" oder eine Kategorie „Ton" haben
- `Setting` ist ein globaler Key-Value-Store (Firmendaten, Rechnungsnummernkreis)
- `LetterheadTemplate.kind @unique` — genau ein Briefpapier pro Datenbank
- `User.email @unique` — global über alle Kunden hinweg

Mandantenfähigkeit nachzurüsten hieße: `tenantId` auf rund 40 Modelle, jede Query
anfassen, alle Unique-Constraints auf `@@unique([tenantId, …])` umstellen. Ein
einziger vergessener Filter wäre ein Datenleck zwischen Kunden. Getrennte
Instanzen sind bei der aktuellen Kundenzahl der bessere Weg — und machen
Backups, Löschkonzept und AV-Verträge deutlich einfacher.

## Neue Kundeninstanz aufsetzen

### 1. Datenbank anlegen

Eine eigene Postgres-Datenbank pro Kunde (Neon, Supabase o. ä.). Zwei URLs
notieren:

- **Pooled** → `DATABASE_URL`
- **Direct / non-pooling** → `DIRECT_URL`

`DIRECT_URL` ist nicht optional: Migrationen brauchen Advisory-Locks, die über
Pooler-Verbindungen nicht zuverlässig funktionieren (Build-Error `P1002`).

### 2. Vercel-Projekt anlegen

„Add New… → Project" → **dasselbe** Git-Repository importieren. Vercel weist
darauf hin, dass das Repo bereits verbunden ist; das ist in Ordnung. Framework
(Next.js), Root Directory und Build Command bleiben auf den Defaults — das
`build`-Script des Repos erledigt Migration und Seed selbst.

### 3. Blob-Store verbinden

Im Vercel-Projekt unter „Storage" einen **eigenen** Blob-Store anlegen und
verbinden. `BLOB_READ_WRITE_TOKEN` wird dabei automatisch gesetzt.

Wird stattdessen ein bestehender Store weiterverwendet, landen die Projektdateien
aller Kunden nebeneinander im selben Bucket.

### 4. Environment-Variablen setzen

Alle Werte für Environment **Production** (und ggf. Preview) eintragen:

| Variable | Wert | Pro Kunde eindeutig? |
|---|---|---|
| `DATABASE_URL` | Pooled-URL aus Schritt 1 | **ja** |
| `DIRECT_URL` | Direct-URL aus Schritt 1 | **ja** |
| `AUTH_SECRET` | `openssl rand -base64 32` | **ja** |
| `AUTH_URL` | `https://<kundendomain>` | **ja** |
| `SEED_ADMIN_EMAIL` | Admin-Adresse des Kunden | **ja** |
| `SEED_ADMIN_PASSWORD` | Zufälliges Initialpasswort | **ja** |
| `CRON_SECRET` | Zufallswert | **ja** |
| `BLOB_READ_WRITE_TOKEN` | automatisch aus Schritt 3 | **ja** |
| `RESEND_API_KEY` | Resend-Key | gemeinsam möglich |
| `EMAIL_FROM` | Absenderadresse des Kunden (Domain in Resend verifiziert) | **ja** |
| `SEED_DEMO_DATA` | **nicht setzen** (Default: aus) | — |

`AUTH_SECRET` muss pro Instanz unterschiedlich sein. Bei identischem Secret ist
ein Session-Cookie aus Instanz A auch gegen Instanz B gültig.

`SEED_ADMIN_PASSWORD` ist in Produktion Pflicht: Fehlt es beim erstmaligen
Anlegen des Admins, bricht der Seed den Build bewusst ab, statt einen Account mit
Default-Passwort anzulegen.

### 5. Domain verbinden

Kundendomain im Vercel-Projekt hinterlegen und `AUTH_URL` darauf setzen.

### 6. Deployen und übergeben

Erster Deploy führt automatisch `prisma migrate deploy` und `prisma db seed` aus.
Danach:

1. Mit `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` einloggen
2. Passwort des Admin-Accounts ändern (bleibt bei künftigen Deploys erhalten)
3. Unter `/settings` Firmendaten, Rechnungsnummernkreis und Briefpapier-PDFs
   hinterlegen — das ist das gesamte Branding, kein Code-Fork nötig
4. `SEED_ADMIN_PASSWORD` in Vercel auf einen neuen Zufallswert setzen oder den
   Wert dokumentiert ablegen (er wird nicht mehr angewendet, solange der Account
   existiert)

## Seed-Verhalten

Der Seed läuft bei **jedem** Deploy mit (`build`-Script) und ist so gebaut, dass
er laufende Instanzen nicht anfasst:

- Existiert der Admin bereits, passiert nichts — ein vom Kunden geändertes
  Passwort bleibt erhalten.
- Demo-Stammdaten (Disponent-Account, Beispiel-Lagerorte, -Kategorien und
  -Positionen mit Beispielpreisen) werden nur mit `SEED_DEMO_DATA=true` angelegt.
  Für lokale Entwicklung sinnvoll, für Kundeninstanzen nicht.
- In Produktion wird kein Klartext-Passwort in die Build-Logs geschrieben.

**Ausgesperrter Kunde:** `SEED_ADMIN_FORCE_PASSWORD=true` zusammen mit einem
neuen `SEED_ADMIN_PASSWORD` setzen, einmal redeployen, danach die Variable wieder
auf `false` setzen. Bleibt sie stehen, überschreibt jeder Deploy das Passwort.

## Updates ausrollen

Alle Instanzen hängen am selben Repo. Zwei Varianten:

**Alle Kunden gleichzeitig** — jedes Vercel-Projekt hat `main` als Production
Branch. Ein Push deployt überall. Einfach, aber kein gestaffelter Rollout.

**Gestaffelt** — pro Kunde ein Deploy-Branch (`prod/kunde-a`), im jeweiligen
Vercel-Projekt als Production Branch eingetragen. Merge nach `main`, dann
kundenweise weitermergen. Bei Fremdkunden die empfohlene Variante: neue Releases
lassen sich erst auf der eigenen Instanz verifizieren.

## Betrieb

**Fehlgeschlagene Migration** — der Deploy schlägt fehl, die bisherige Version
läuft unverändert weiter. Kein Ausfall, aber es fällt nur auf, wenn man
hinschaut. Bei mehreren Instanzen lohnt sich Deploy-Benachrichtigung pro Projekt.

**Backups** — liegen beim DB-Anbieter, nicht bei Vercel. Pro Kunde prüfen, ob
Point-in-Time-Recovery im gebuchten Tarif enthalten ist.

**Cron** — `vercel.json` definiert `/api/cron/overdue-invoices` täglich 05:00 UTC.
Der Job läuft pro Projekt eigenständig; auf Hobby-Tarifen sind Cron-Jobs stark
limitiert.

**Kunde kündigt** — Vercel-Projekt löschen, Datenbank löschen, Blob-Store löschen.
Durch die Trennung ist das ein vollständiges Löschen ohne Restdaten in fremden
Systemen.

## Rechtlicher Rahmen

Beim Hosten von Daten anderer Unternehmen wird ein Auftragsverarbeitungsvertrag
nach Art. 28 DSGVO benötigt, ebenso ein dokumentiertes Backup- und
Löschkonzept. Bei getrennten Instanzen ist die Zusicherung „Ihre Daten liegen in
einer eigenen Datenbank" belastbar — deshalb sollte die Trennung aus Schritt 1–3
nicht aus Kostengründen aufgeweicht werden.
