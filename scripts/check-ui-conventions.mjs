#!/usr/bin/env node
/**
 * Prüft die maschinell prüfbaren Regeln aus docs/ui-conventions.md.
 *
 * Läuft ohne Datenbank und ohne Netz — geeignet für CI und pre-commit.
 * Aufruf: npm run check:ui
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/** Dateien, die eine Regel bewusst definieren und daher ausgenommen sind. */
const ALLOW = {
  palette: [],
  density: ["src/components/ui/table.tsx"],
  iconSize: ["src/components/ui/button.tsx", "src/components/ui/row-actions.tsx"],
  dialogWidth: ["src/components/ui/dialog.tsx"],
  cardTitleSize: ["src/components/ui/card.tsx"],
  rawToast: ["src/lib/toast.ts"],
  tabularNums: ["src/app/globals.css", "src/components/ui/stat-tile.tsx"],
};

const RULES = [
  {
    key: "palette",
    // Tailwind-Palettenfarben statt semantischer Tokens
    pattern:
      /\b(?:bg|text|border|ring|from|to|via)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/,
    message:
      "Tailwind-Palettenfarbe statt Token. Siehe docs/ui-conventions.md §1 (Farben).",
  },
  {
    key: "density",
    pattern: /\[&_t[dh]\]:/,
    message:
      'Ad-hoc Tabellen-Dichte. Stattdessen <Table density="comfortable|compact|dense">. §3.',
  },
  {
    key: "iconSize",
    pattern: /size="icon"[^>]*className="h-[78] w-[78]|className="h-[78] w-[78]"[^>]*size="icon"/,
    message:
      'Icon-Button-Größe überschrieben. Stattdessen size="iconSm" / "iconXs". §2 und §4.',
  },
  {
    key: "dialogWidth",
    pattern: /<DialogContent[^>]*className="[^"]*max-w-/,
    message: 'Dialog-Breite per className. Stattdessen <DialogContent size="…">. §9.',
  },
  {
    key: "cardTitleSize",
    pattern: /<CardTitle[^>]*className="[^"]*\btext-(?:xs|sm|base|lg|xl)\b/,
    message: 'CardTitle-Größe per className. Stattdessen <CardTitle size="sm">. §8.',
  },
  {
    key: "rawToast",
    pattern: /toast\.error\(\s*(?:"Fehler"|\w+ instanceof Error)/,
    message:
      "Roher Fehler-Toast. Stattdessen toastError() / toastBlocked() aus @/lib/toast. §11.",
  },
  {
    key: "tabularNums",
    pattern: /\btabular-nums\b/,
    message: 'tabular-nums direkt gesetzt. Stattdessen die Utility-Klasse "num". §12.',
  },
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx?|css)$/.test(entry)) out.push(full);
  }
  return out;
}

const findings = [];
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).split(sep).join("/");
  const lines = readFileSync(file, "utf8").split("\n");
  for (const rule of RULES) {
    if (ALLOW[rule.key].includes(rel)) continue;
    lines.forEach((line, i) => {
      // Kommentarzeilen ignorieren — dort stehen die Regeln oft als Erklärung.
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      if (rule.pattern.test(line)) {
        findings.push({ file: rel, line: i + 1, rule: rule.key, message: rule.message, text: line.trim() });
      }
    });
  }
}

if (findings.length === 0) {
  console.log("✓ UI-Konventionen eingehalten.");
  process.exit(0);
}

const byRule = new Map();
for (const f of findings) {
  if (!byRule.has(f.rule)) byRule.set(f.rule, []);
  byRule.get(f.rule).push(f);
}

console.error(`✗ ${findings.length} Verstoß/Verstöße gegen docs/ui-conventions.md:\n`);
for (const [rule, items] of byRule) {
  console.error(`  [${rule}] ${items[0].message}`);
  for (const it of items) {
    console.error(`    ${it.file}:${it.line}  ${it.text.slice(0, 110)}`);
  }
  console.error("");
}
process.exit(1);
