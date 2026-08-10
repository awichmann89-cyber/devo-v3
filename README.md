# Cratel — Materialverwaltung für Veranstaltungstechnik

Eine Next.js 15 / React 19 Web-App zur Verwaltung von Veranstaltungstechnik-Material.
Geräte werden in Packeinheiten organisiert, Lagerorten zugeordnet und Projekten (Veranstaltungen) zugewiesen.
Pro Projekt gibt es einen **Planungszeitraum** (blockt Geräte) und einen **Berechnungszeitraum** (für Mietkalkulation).

## Features

- **Stammdaten:** Geräte, Packeinheiten (Cases/Racks), Lagerorte, Kategorien
- **Projekte:** Veranstaltungen mit separaten Planungs- und Berechnungszeiträumen
- **Verfügbarkeitsprüfung:** Automatische Erkennung von Doppelbuchungen
- **Kalender:** Gantt-artige Timeline aller Buchungen
- **QR-Codes** für jedes Gerät
- **PDF-Export:** Packlisten und Mietangebote
- **Rollensystem:** Admin / Disponent / Leser

## Tech Stack

- Next.js 15 (App Router) mit React 19
- TypeScript
- Tailwind CSS + shadcn/ui (alle Komponenten)
- PostgreSQL via Prisma 5
- NextAuth v5 (Auth.js)
- jsPDF + qrcode

## Setup

### Voraussetzungen
- Node.js 20+
- PostgreSQL 14+ (lokal oder via Docker)

### 1. Dependencies installieren

```bash
npm install
```

### 2. PostgreSQL starten

Option A — via Docker:
```bash
docker run --name devo-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
docker exec -it devo-postgres createdb -U postgres devo
```

Option B — lokal installierte DB nutzen und `DATABASE_URL` in `.env` anpassen.

### 3. Environment-Variablen

```bash
cp .env.example .env
# AUTH_SECRET generieren:
# openssl rand -base64 32
```

Für lokale Entwicklung `SEED_DEMO_DATA="true"` gesetzt lassen — sonst startet die
App ohne Beispiel-Stammdaten.

### 4. Datenbank initialisieren

```bash
npm run db:push      # Schema in DB pushen
npm run db:seed      # Admin-User (+ Beispieldaten bei SEED_DEMO_DATA=true)
```

### 5. Entwicklungsserver starten

```bash
npm run dev
```

Die App läuft auf [http://localhost:3000](http://localhost:3000).

**Login (Seed-Daten):**
- Admin: `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` aus der `.env`
- Disponent (nur mit `SEED_DEMO_DATA=true`): `disponent@cratel.local` / `disponent123`

## Deployment

Die App wird pro Kunde als eigene Instanz betrieben (eigenes Vercel-Projekt,
eigene Datenbank, eigener Blob-Store). Details und Schritt-für-Schritt-Checkliste:
[DEPLOYMENT.md](DEPLOYMENT.md).

## Befehle

| Befehl | Beschreibung |
|---|---|
| `npm run dev` | Dev-Server starten |
| `npm run build` | Production-Build |
| `npm run db:push` | Schema synchronisieren (Dev) |
| `npm run db:migrate` | Migration erstellen |
| `npm run db:seed` | Seed-Daten laden |
| `npm run db:studio` | Prisma Studio öffnen |
| `npm run lint` | ESLint ausführen |

## Datenmodell

```
User (Rolle: ADMIN | DISPONENT | READER)
Location (Lagerort)
Category (Ton, Licht, Video, ...)
PackUnit (Case, Rack, ...)
Device → gehört zu Location, Category, PackUnit
Project (Planungs- + Berechnungszeitraum)
ProjectAssignment (Device ↔ Project, mit Anzahl + Preis-Snapshot)
```

### Verfügbarkeitslogik
Bei Zuweisung eines Geräts zu einem Projekt wird geprüft, ob das Gerät im Planungszeitraum bereits in einem anderen Projekt (Status: DRAFT, CONFIRMED, ACTIVE) gebucht ist. Konflikte werden angezeigt und können bei Bedarf bewusst überschrieben werden (z.B. bei mehreren Stück).

## Projekt-Struktur

```
src/
  app/
    (app)/                Geschützte App-Routen (mit Sidebar/Header)
      page.tsx            Dashboard
      devices/            Geräte CRUD
      pack-units/         Packeinheiten
      locations/          Lagerorte
      projects/           Projekte + Material-Zuweisung
      calendar/           Timeline-Ansicht
      users/              Benutzerverwaltung (ADMIN)
    api/
      auth/[...nextauth]/ NextAuth Routes
      projects/[id]/      PDF-Export
    login/                Login-Seite
  components/
    ui/                   shadcn/ui Komponenten
    layout/               Sidebar, Header
  lib/
    prisma.ts             DB-Client
    auth-helpers.ts       Auth + Rollen-Helper
    validators.ts         Zod-Schemas
    availability.ts       Konflikt-Erkennung
    labels.ts             Übersetzungen
prisma/
  schema.prisma           DB-Schema
  seed.ts                 Seed-Skript
```

## Nächste Schritte (Ideen)

- Drag & Drop in der Kalender-Ansicht
- Email-Benachrichtigungen bei neuen Buchungen
- Audit-Log
- File-Uploads (Bilder, Datenblätter)
- Mobile-App / PWA für Lager-Scanning per Handy
- Wartungs-Intervalle
