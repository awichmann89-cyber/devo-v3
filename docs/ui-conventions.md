# UI-Konventionen Cratel

> Verbindliche Regeln, die aus dem UI-Review vom 2026-08-05 hervorgegangen sind
> (siehe [ui-review.md](ui-review.md)). Wer eine neue Seite oder Komponente baut, hält sich
> daran — sonst driftet die App wieder auseinander.
>
> `npm run check:ui` prüft die maschinell prüfbaren Regeln.

---

## Leitsatz

**Gleiche Aufgabe → gleiche UI.** Wenn du ein Muster kopierst, extrahiere es stattdessen.
Bevor du ein Control von Hand baust, prüfe `src/components/ui`, `src/components/layout` und
`src/components/filters`.

---

## 1. Farben — nur Tokens

Nie Tailwind-Palettenfarben (`bg-red-500`, `text-green-700`, `fuchsia-*`, `amber-*`, …).
Immer die semantischen Tokens aus [globals.css](../src/app/globals.css):

| Bedeutung | Token | Fläche |
|---|---|---|
| Akzent / Marke | `primary` | `primary-subtle` |
| Erfolg, Gewinn, bezahlt | `success` | `success-subtle` |
| Warnung, nicht abrechenbar | `warning` | `warning-subtle` |
| Fehler, überfällig, Verlust | `destructive` | `destructive-subtle` |
| Neutrale Information | `info` | `info-subtle` |
| Zumietung | `subhire` | `subhire-subtle` |

Flächen: `background` · `card` · `secondary` (surface-2) · `accent` (Hover) · `muted`.
Text: `foreground` · `muted-foreground` · `faint`.

Neue Statusfarbe? → Token-Paar in `globals.css` (Light **und** Dark) + Eintrag in
[tailwind.config.ts](../tailwind.config.ts). Nicht inline lösen.

## 2. Control-Höhen

| Höhe | Wofür |
|---|---|
| **34 px** | Standard: `Button` (default), `Input`, `SelectTrigger`, `Button size="icon"` |
| **30 px** | Kompakt: `Button size="sm"`, Filter-Chips, `Button size="icon"`→`iconSm` ist 32 px |
| 40 px | `Button size="lg"` — nur für Primäraktionen auf leeren Seiten |

Nie per `className="h-9"` o. ä. nachjustieren. Wenn eine Höhe fehlt, kommt sie als Variante
ins Primitive.

## 3. Tabellen

```tsx
<Table density="comfortable">   {/* Stammdaten-Listen */}
<Table density="compact">       {/* Finanz- und Zeitlisten */}
<Table density="dense">         {/* Zuordnungstabellen im Projekt */}
```

- **Kein** `className="[&_td]:px-2 …"` — ausschließlich die `density`-Prop.
- Rahmen ist Standard (`bordered`, default `true`).
- Leerzeile immer über `<TableEmpty colSpan={n} hasData={rows.length > 0} entity="Kunden" />`.
- Gruppen-Kopfzeilen über `<TableGroupRow />`, Kind-Einrückung über `groupChildIndent(depth)`.
- Zeile klickbar, **wenn es eine Detailseite gibt** (Projekte, Geräte, Packeinheiten, Kabel,
  Personen). Dann `cursor-pointer` + `router.push`, und Links/Aktionen brauchen
  `e.stopPropagation()` (macht `RowActions` automatisch).

## 4. Zeilen-Aktionen

```tsx
<RowActions density="comfortable">
  <RowAction icon={Pencil} label="Bearbeiten" onClick={…} />
  <RowAction icon={Trash2} label="Löschen" destructive onClick={…} />
</RowActions>
```

- `label` ist Pflicht — wird `title` **und** `aria-label`.
- Destruktive Aktionen immer `destructive` (rot + `destructive-subtle`-Hover), nie grau.
- Der **Stift öffnet einen Dialog**. Navigation läuft über den Namens-Link bzw. den
  Zeilen-Klick — kein Stift, der navigiert.
- Löschen geht **immer** über `ConfirmDialog`.

## 5. Listenseiten

```tsx
<ListCard
  title="Kunden"
  info="…"                      // InfoHint neben dem Titel
  action={<CustomerDialog />}    // Primäraktion — immer oben rechts
  secondaryAction={…}            // links davon, variant="outline"
  count={{ shown, total }}
  filters={<>…</>}
>
  <Table density="comfortable">…</Table>
</ListCard>
```

Die `page.tsx` lädt nur Daten und rendert die Tabellen-Komponente — kein eigenes
Card-Gerüst, kein eigener Seitentitel (den liefert der [Header](../src/components/layout/header.tsx)
über die `TITLES`-Map).

Container-Abstand: `space-y-4`.

## 6. Detailseiten

```tsx
<DetailHeader
  backHref="/persons"
  title={person.name}
  badges={<>…</>}
  subtitle={…}
  actions={<>…</>}
/>
```

Danach `space-y-4`, Karten mit `<CardHeader>` / `<CardContent>` im Standard-Padding.

## 7. Filterleiste

Ausschließlich Bausteine aus [filter-controls.tsx](../src/components/filters/filter-controls.tsx):

| Baustein | Zweck |
|---|---|
| `FilterSearch` | Suchfeld mit Lupe (`grow` für schmale Panels) |
| `FilterChips` / `StatusChips` | Ein- oder Mehrfachauswahl, getönt aus `badgeVariants` |
| `DateRangeControls` | Von/Bis + Zeitraum-Preset |
| `FilterResetButton` | nur sichtbar, wenn Filter ≠ Standard |
| `FilterDivider` | vertikaler Trenner |
| `FilterCount` | Trefferzähler (liefert `ListCard` über `count`) |

Placeholder sprechend formulieren: `"Name, E-Mail oder Telefon…"`, nicht `"Suche…"`.

## 8. Karten & Kacheln

- `CardTitle` ist `text-base` (Default). Leiser Tier nur explizit: `<CardTitle size="sm">`.
- **Keine Cards in Cards.** Innen `<div>`, `<ul className="divide-y rounded-lg border">`
  oder `<EmptyState bare />`.
- KPI-Kacheln immer `<StatTile>` in `<StatTileGrid>` — nie von Hand.
- Leere Flächen: `<EmptyState icon={…} title="…" action={…} />` mit sinnvoller Erstaktion.

## 9. Dialoge

```tsx
<DialogContent size="sm">   {/* Bestätigung, 1–2 Felder */}
<DialogContent size="md">   {/* Standardformular (Default) */}
<DialogContent size="lg">   {/* Stammdaten mit Grid */}
<DialogContent size="xl">   {/* Editor / große Tabelle */}
```

- Nie `className="max-w-…"` — `max-h-[90vh]` ist im Primitive.
- Bei hohen Formularen `<DialogBody>` um den Formularteil, damit Header und Footer
  (und damit „Speichern") sichtbar bleiben.
- `DialogDescription` immer setzen — ein Satz, was der Dialog tut.
- `autoFocus` auf das erste Eingabefeld.
- Footer: „Abbrechen" (`variant="outline"`) links, Submit rechts mit
  `{pending && <Loader2 className="h-4 w-4 animate-spin" />}` und
  `{isEdit ? "Speichern" : "Anlegen"}`.
- Aktions-Label: **„&lt;Entität&gt; anlegen"** — nicht „Neuer/Neue/Neues …".

## 10. Speichern & Feedback

| Muster | Wann | Feedback |
|---|---|---|
| Dialog + Submit | Stammdaten anlegen/bearbeiten | Erfolgs-Toast |
| Auto-Save (`useAutoSave`) | Formulare mit vielen Feldern | `<AutoSaveIndicator>` |
| Inline (`onBlur`, Stepper) | Mengen, Gruppennamen, Rabatte | `<AutoSaveIndicator status={useTransitionSaveStatus(pending)} />` im Bereichs-Kopf |
| Card mit eigenem Speichern | Einstellungen (Nummernkreise etc.) | Erfolgs-Toast pro Card |

Stilles Speichern ohne jede Rückmeldung ist nicht erlaubt.

**Einstellungen bleiben bewusst bei explizitem Speichern**: Nummernkreise und Tagesfaktoren
sind riskant genug, dass ein bestätigender Klick gewollt ist.

## 11. Toasts

```ts
toast.success("Kunde angelegt");            // "<Entität> angelegt/aktualisiert/gelöscht"
toast.info("… — auf inaktiv gesetzt");      // Ersatzhandlung statt Fehler
toastError(e, "Löschen");                   // technischer Fehler → "Löschen fehlgeschlagen"
toastBlocked(e, "Löschen");                 // fachliche Sperre → "Löschen nicht möglich"
```

Nie `toast.error("Fehler", { description: … })` von Hand — immer die Helper aus
[src/lib/toast.ts](../src/lib/toast.ts). Bei Server-Actions, die navigieren,
`isRedirectError(e)` durchreichen.

Feldvalidierung gehört ans Feld (`required`, Inline-Fehlertext), nicht in einen Toast.

## 12. Zahlen, Beträge, Datum

- Beträge, Mengen, Nummernkreise: `className="num"` (`font-mono tabular-nums`),
  hervorgehoben `num-strong`.
- Datumsangaben bleiben in der Sans — sie werden gelesen, nicht verglichen.
- Beträge über `formatCurrency()`, Abzüge über `formatCurrencySigned(x, { negate: true })`
  (typografisches Minus U+2212, `0` → „—").
- Nullwert-Platzhalter: `—` (Em-Dash).

## 13. Status-Labels

Label **und** Badge-Variante kommen immer aus [labels.ts](../src/lib/labels.ts):

```ts
projectStatusLabel / projectStatusVariant / projectStatusRowClass
invoiceStatus / invoiceStatusLabel / invoiceStatusVariant / invoiceKindLabel
quoteStatus / quoteStatusLabel / quoteStatusVariant
employmentTypeLabel / employmentTypeVariant
```

Nie einen Enum-Wert direkt rendern und nie Statusfarben pro Tabelle neu erfinden.

Badge-Größe: Default in Detailansichten und `comfortable`-Tabellen, `size="sm"` in
`compact`/`dense`-Tabellen.

## 14. Barrierefreiheit

- Jeder Icon-Button braucht `title` **und** `aria-label` (`RowAction` erzwingt das).
- Eigene `<button>`-Chips brauchen einen Focus-Ring
  (`focus-visible:ring-2 focus-visible:ring-ring`).
- Formularsteuerelemente über `Checkbox`/`Input`/`Select` — keine rohen `<input>`.
- UI-Texte auf Deutsch, auch `sr-only`.
