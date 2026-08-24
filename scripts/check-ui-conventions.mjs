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
  // globals.css stylt die Task-List-Checkboxen des Editors per CSS-Selektor —
  // das ist kein von Hand gebautes Control.
  rawCheckbox: ["src/components/ui/checkbox.tsx", "src/app/globals.css"],
  handRolledDestructive: ["src/components/ui/button.tsx"],
  controlHeight: [
    "src/components/ui/input.tsx",
    "src/components/ui/select.tsx",
    "src/components/ui/textarea.tsx",
    // Definiert die dense-Stufe des Mengen-Steppers selbst.
    "src/components/project/group-table.tsx",
  ],
  iconButtonLabel: ["src/components/ui/row-actions.tsx"],
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
  {
    key: "rawCheckbox",
    pattern: /type="(checkbox|radio)"/,
    message:
      "Rohes <input type=checkbox|radio>. Stattdessen <Checkbox> aus @/components/ui. §14.",
  },
  {
    key: "handRolledDestructive",
    pattern: /className=\{?"[^"]*text-destructive hover:text-destructive/,
    message:
      'Destruktive Aktion per className. Stattdessen variant="ghostDestructive" bzw. <RowAction destructive>. §4.',
  },
];

/**
 * Regeln, die den kompletten JSX-Öffnungs-Tag brauchen — mehrzeilige Tags
 * bekommt die zeilenweise Prüfung oben nicht zu fassen.
 */
const TAG_RULES = [
  {
    key: "controlHeight",
    tags: ["Input", "SelectTrigger", "Textarea"],
    test: (tag) => /className=\{?"[^"]*\bh-\[?\d/.test(tag),
    message:
      'Control-Höhe per className. Stattdessen size="sm" | "xs" am Primitive. §2.',
  },
  {
    key: "iconButtonLabel",
    tags: ["Button"],
    test: (tag) =>
      /size=\{?"(icon|iconSm|iconXs)"/.test(tag) && !/aria-label/.test(tag),
    message:
      "Icon-Button ohne aria-label. Zeilen-Aktionen über <RowActions>/<RowAction label> bauen. §4 und §14.",
  },
];

const BACKSLASH = String.fromCharCode(92);

/** Liest den JSX-Öffnungs-Tag ab `i` — klammer- und quote-bewusst. */
function tagAt(src, i) {
  let depth = 0;
  let quote = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (quote) {
      if (c === quote && src[j - 1] !== BACKSLASH) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(i, j + 1);
  }
  return src.slice(i);
}

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
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  for (const rule of RULES) {
    if ((ALLOW[rule.key] ?? []).includes(rel)) continue;
    lines.forEach((line, i) => {
      // Kommentarzeilen ignorieren — dort stehen die Regeln oft als Erklärung.
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      if (rule.pattern.test(line)) {
        findings.push({ file: rel, line: i + 1, rule: rule.key, message: rule.message, text: line.trim() });
      }
    });
  }
  for (const rule of TAG_RULES) {
    if ((ALLOW[rule.key] ?? []).includes(rel)) continue;
    for (const name of rule.tags) {
      const re = new RegExp("<" + name + "\\b", "g");
      let m;
      while ((m = re.exec(src))) {
        const tag = tagAt(src, m.index);
        if (!rule.test(tag)) continue;
        findings.push({
          file: rel,
          line: src.slice(0, m.index).split("\n").length,
          rule: rule.key,
          message: rule.message,
          text: tag.replace(/\s+/g, " ").slice(0, 110),
        });
      }
    }
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
