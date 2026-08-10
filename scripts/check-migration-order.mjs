#!/usr/bin/env node
/**
 * Prüft, ob die Prisma-Migrationen auf einer LEEREN Datenbank durchlaufen.
 *
 * Prisma wendet Migrationen in lexikographischer Reihenfolge der Ordnernamen
 * an, nicht numerisch — ein Ordner `7_…` liefe nach `16_…`. Auf einer bereits
 * migrierten Datenbank fällt das nie auf, weil dort jede Migration einzeln zum
 * Entwicklungszeitpunkt lief; eine frische Kundeninstanz bricht dagegen mit
 * P3018 ab (so geschehen: `16_add_subhire_adhoc_link` vor
 * `06_add_invoice_prepayment_and_adhoc`).
 *
 * Das Skript liest die migration.sql-Dateien in genau Prismas Reihenfolge und
 * meldet jede Tabelle bzw. jeden Enum-Typ, der referenziert wird, bevor er
 * angelegt wurde.
 *
 * Läuft ohne Datenbank und ohne Netz — geeignet für CI und pre-commit.
 * Aufruf: npm run check:migrations
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "prisma", "migrations");

const dirs = readdirSync(DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort(); // exakt die Reihenfolge, die Prisma verwendet

/** Bereits angelegte Tabellen bzw. Enum-Typen über alle Migrationen hinweg. */
const tables = new Set();
const types = new Set();
const problems = [];

const strip = (s) => s.replace(/"/g, "");

/** Alle Vorkommen eines Musters als entquoteter Bezeichner. */
function matches(sql, pattern) {
  return [...sql.matchAll(pattern)].map((m) => strip(m[1]));
}

for (const dir of dirs) {
  const sql = readFileSync(join(DIR, dir, "migration.sql"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ") // Blockkommentare
    .replace(/--[^\n]*/g, " "); // Zeilenkommentare

  // Was diese Migration selbst anlegt, gilt innerhalb der Datei als bekannt —
  // dort bestimmt die Statement-Reihenfolge, und die ist per Konstruktion ok.
  const created = new Set(
    matches(sql, /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+("?[\w."]+"?)/gi),
  );
  const createdTypes = new Set(matches(sql, /CREATE TYPE\s+("?[\w."]+"?)/gi));

  const refs = [
    ...matches(sql, /ALTER TABLE\s+("?[\w."]+"?)/gi).map((name) => ({
      name,
      kind: "table",
      stmt: "ALTER TABLE",
    })),
    ...matches(sql, /REFERENCES\s+("?[\w."]+"?)/gi).map((name) => ({
      name,
      kind: "table",
      stmt: "REFERENCES",
    })),
    ...matches(
      sql,
      /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF NOT EXISTS\s+)?"?[\w.]+"?\s+ON\s+("?[\w."]+"?)/gi,
    ).map((name) => ({ name, kind: "table", stmt: "CREATE INDEX" })),
    ...matches(sql, /ALTER TYPE\s+("?[\w."]+"?)/gi).map((name) => ({
      name,
      kind: "type",
      stmt: "ALTER TYPE",
    })),
  ];

  for (const ref of refs) {
    const known =
      ref.kind === "table"
        ? tables.has(ref.name) || created.has(ref.name)
        : types.has(ref.name) || createdTypes.has(ref.name);
    if (!known) {
      problems.push(`${dir}: ${ref.stmt} "${ref.name}" — noch nicht angelegt`);
    }
  }

  created.forEach((t) => tables.add(t));
  createdTypes.forEach((t) => types.add(t));
  for (const t of matches(sql, /DROP TABLE(?:\s+IF EXISTS)?\s+("?[\w."]+"?)/gi)) {
    tables.delete(t);
  }
}

if (problems.length > 0) {
  console.error(
    `✗ ${problems.length} Reihenfolge-Konflikt(e) in prisma/migrations:\n`,
  );
  problems.forEach((p) => console.error("  " + p));
  console.error(
    "\nMigrationen werden lexikographisch angewendet. Ordnernamen mit " +
      "zweistelligem Präfix (07_… statt 7_…) benennen.",
  );
  process.exit(1);
}

console.log(
  `✓ ${dirs.length} Migrationen, Reihenfolge konsistent ` +
    `(${dirs[0]} … ${dirs[dirs.length - 1]}).`,
);
