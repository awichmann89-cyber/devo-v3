# UI-Review Cratel — Fokus Einheitlichkeit

> ## ✅ Umgesetzt am 2026-08-05
>
> Dieses Dokument ist die **Befundaufnahme**. Alle Punkte wurden anschließend umgesetzt; die
> daraus abgeleiteten verbindlichen Regeln stehen in **[ui-conventions.md](ui-conventions.md)**
> und werden von `npm run check:ui` geprüft.
>
> Das Dokument bleibt als Begründungs-Historie erhalten — die Zeilennummern beziehen sich auf
> den Stand **vor** der Umsetzung und passen nicht mehr zum aktuellen Code.
>
> Bewusst **nicht** umgesetzt (mit Begründung):
> - **E6c** Sortierbare Spaltenköpfe — optional, kein Konsistenzproblem.
> - **I3** Settings behalten explizites Speichern (Nummernkreise sind riskant) — dokumentiert
>   in ui-conventions.md §10.
> - **K1.3** Datumsspalten bleiben in der Sans; stattdessen wurde der irreführende
>   Intent-Kommentar in `tailwind.config.ts` korrigiert.

---

> Stand: 2026-08-05 · Basis: `main` @ `0bcf993` · Umfang: komplette WebApp (`src/app`, `src/components`)
>
> **Zweck dieses Dokuments:** Arbeitsgrundlage für eine Folge-Session. Jeder Punkt ist so
> formuliert, dass er einzeln umgesetzt werden kann. Reihenfolge innerhalb eines Kapitels =
> empfohlene Bearbeitungsreihenfolge (Primitives zuerst, dann Call-Sites).

---

## Leitprinzip

> **Gleiche Aufgabe → gleiche UI.** Die App hat ein solides Design-System (Tokens in
> `globals.css`, Primitives in `src/components/ui`). Das Problem ist nicht das System, sondern
> dass es an vielen Stellen umgangen wird: Muster wurden kopiert statt extrahiert, und die
> Kopien sind auseinandergedriftet. Fast alle Findings unten lassen sich lösen, indem ein
> bestehendes Muster zur einzigen Quelle gemacht und die Kopien entfernt werden.

**Die vier größten Baustellen** (alles andere ist Detailarbeit):

| # | Thema | Varianten heute | Ziel |
|---|---|---|---|
| 1 | Filterleiste / Suche | 3 Such-Implementierungen, 3 Reset-Buttons, 4 Status-Filter-Konzepte | 1× `filter-controls` |
| 2 | Tabellen-Dichte + Rahmen | 5 Dichte-Varianten via `[&_td]:…`-Strings, 2 Rahmen-Varianten | `density`-Prop am Primitive |
| 3 | Icon-Buttons in Tabellen | 3 Größen (34/32/28 px), Löschen mal rot mal grau | 1 Größe, 1 Farbregel |
| 4 | Speichern-Feedback | Dialog-Save, Auto-Save mit Indikator, stilles `onBlur`, Card-Save-Button | Auto-Save überall mit Indikator |

---

## A. Fundament: Design-Tokens & Primitives

### A1 — Hartkodierte Tailwind-Palettenfarben statt Tokens 🔴

Das Token-System (`--success`, `--warning`, `--info`, `--destructive`, `*-subtle`) wird an
mehreren Stellen umgangen. Diese Farben brechen im Dark Mode aus dem Schema aus und sind
nicht zentral änderbar.

| Datei | Zeilen | Farbe | Bedeutung |
|---|---|---|---|
| [assignments-section.tsx](src/app/(app)/projects/[id]/assignments-section.tsx#L811) | 811, 826, 872, 947, 982, 1043, 1124, 1129, 1144 | `fuchsia-*` | Zumietung |
| [costs-section.tsx](src/app/(app)/projects/[id]/costs-section.tsx#L627) | 627 | `fuchsia-*` | Zumietung |
| [timeline.tsx](src/app/(app)/calendar/timeline.tsx#L204) | 204, 448 | `fuchsia-600` | „Meine Einsätze" |
| [finances-section.tsx](src/app/(app)/projects/[id]/finances-section.tsx#L574) | 574–575, 584, 595 | `green-*` / `red-*` | Gewinn / Verlust |
| [finances-section.tsx](src/app/(app)/projects/[id]/finances-section.tsx#L1038) | 1038, 1207 | `amber-*` | Warn-Box |

**Zu tun:**
1. Neues Semantik-Token-Paar in [globals.css](src/app/globals.css) einführen:
   `--subhire` / `--subhire-subtle` (Light + Dark), in [tailwind.config.ts](tailwind.config.ts)
   registrieren. Damit wird „Zumietung" eine erste-Klasse-Statusfarbe wie `success`/`warning`.
2. `green-*` → `success` / `success-subtle`, `red-*` → `destructive` / `destructive-subtle`.
   Im Forecast wird für exakt dieselbe Gewinn/Verlust-Semantik bereits korrekt
   `text-success` / `text-destructive` verwendet ([forecast-view.tsx:322](src/app/(app)/finances/forecast/forecast-view.tsx#L322)) — das ist die Referenz.
3. `amber-*` → `warning` / `warning-subtle` + `border-warning/40`. Referenz-Implementierung
   existiert schon als `ExpiredBox` in [angebot/[token]/page.tsx:191](src/app/angebot/[token]/page.tsx#L191).
4. Lint-Regel oder Grep-Check im CI, der neue Palettenfarben verhindert:
   `(bg|text|border)-(red|green|amber|fuchsia|…)-\d{2,3}`

### A2 — `Badge` hat `max-w-[6rem] truncate` als Default 🔴

[badge.tsx:8](src/components/ui/badge.tsx#L8) begrenzt **jeden** Badge auf 96 px und
schneidet ab. Das ist ein Layout-Zwang im Primitive, den Call-Sites wieder aufheben müssen
(`max-w-none` in [quotes-table.tsx:280](src/app/(app)/finances/quotes-table.tsx#L280),
[finances-section.tsx:1346](src/app/(app)/projects/[id]/finances-section.tsx#L1346)) — und
den die meisten Call-Sites *nicht* aufheben. Konkret abgeschnitten werden u. a.
„Prüfung nicht erforderlich" ([devices/[id]/page.tsx:60](src/app/(app)/devices/[id]/page.tsx#L60)),
„nicht abrechenbar" ([group-table.tsx:146](src/components/project/group-table.tsx#L146)) und
„Nicht erforderlich" ([devices-section.tsx:183](src/app/(app)/material/devices-section.tsx#L183)).

**Zu tun:** `max-w-[6rem] truncate` aus der Basis entfernen. Wo Kürzung wirklich gewünscht
ist (nur Tabellen mit engen Spalten), gezielt per `className` setzen.

### A3 — `Badge` Schriftgröße: 19 von 50 Call-Sites überschreiben auf `text-[10px]` 🟡

Basis ist `text-[11px]` ([badge.tsx:8](src/components/ui/badge.tsx#L8)), aber 19 Verwendungen
setzen `text-[10px]`. Es gibt keine erkennbare Regel dafür, welche.

**Zu tun:** `size`-Variante zu `badgeVariants` hinzufügen:
```ts
size: {
  default: "px-2 py-0.5 text-[11px]",   // Status in Detailansichten, Headern
  sm:      "px-1.5 py-0.5 text-[10px]", // in dichten Tabellenzeilen
}
```
Dann alle `className="text-[10px]"` durch `size="sm"` ersetzen. Regel dokumentieren:
**`sm` nur in Tabellen mit `density="compact"` oder `"dense"`.**

### A4 — `CardTitle`: `text-base` ist faktisch der Standard, aber nicht der Default 🟡

48 Call-Sites setzen `className="…text-base…"`, nur 24 nutzen den Default (`text-sm`) —
und die 24 sind kein bewusster zweiter Tier, sondern schlicht die älteren Stellen:
6× `<CardTitle>Stammdaten</CardTitle>` bzw. `Projekt bearbeiten`, 12× in
[settings/page.tsx](src/app/(app)/settings/page.tsx), plus
[persons/page.tsx:41](src/app/(app)/persons/page.tsx#L41),
[services/page.tsx:28](src/app/(app)/services/page.tsx#L28),
[devices/[id]/page.tsx:142,180](src/app/(app)/devices/[id]/page.tsx#L142).

Ergebnis: Settings-Karten wirken kleiner/leiser als alle anderen Karten der App.

**Zu tun:** Default in [card.tsx:20](src/components/ui/card.tsx#L20) auf `text-base` ziehen,
dann alle 48 `text-base`-Overrides entfernen. Falls ein leiserer Tier gebraucht wird, als
explizite Variante (`<CardTitle size="sm">`), nicht als Default.

### A5 — Control-Höhen passen in einer Zeile nicht zusammen 🔴

| Control | Höhe | Quelle |
|---|---|---|
| `Button` (default) | **34 px** | [button.tsx:22](src/components/ui/button.tsx#L22) |
| `Button size="sm"` | **30 px** | [button.tsx:23](src/components/ui/button.tsx#L23) |
| `Input` | **36 px** | [input.tsx:10](src/components/ui/input.tsx#L10) |
| `SelectTrigger` | **36 px** | [select.tsx:19](src/components/ui/select.tsx#L19) |
| `Textarea` (min) | 80 px | [textarea.tsx:9](src/components/ui/textarea.tsx#L9) |
| Status-Chip | **26 px** | [filter-controls.tsx:136](src/components/filters/filter-controls.tsx#L136) |

In jeder Filterzeile mit `items-center` stehen damit 36-px-Inputs neben 30-px-Reset-Buttons
neben 26-px-Chips. `FilterSearch` und `DateRangeControls` umgehen das durch
manuelles `className="h-[34px]"` ([filter-controls.tsx:67,92,100,103](src/components/filters/filter-controls.tsx#L67)) —
ein Workaround, der belegt, dass der Default falsch ist.

**Zu tun:**
1. `Input` und `SelectTrigger` auf `h-[34px]` setzen (= Button-Default). Danach die
   `h-[34px]`-Overrides in `filter-controls.tsx` entfernen.
2. Chip-Höhe auf 30 px anheben (= `Button size="sm"`), damit Chips und Reset-Chip mit
   `size="sm"`-Buttons fluchten.
3. Als Kommentar in `button.tsx` festhalten: **34 px = Standard-Controlhöhe, 30 px = kompakt.**

### A6 — Weitere Primitive-Details 🟢

| # | Finding | Datei | Fix |
|---|---|---|---|
| a | Dialog-Overlay `bg-black/80`, Mobile-Drawer-Backdrop `bg-foreground/55` | [dialog.tsx:20](src/components/ui/dialog.tsx#L20), [sidebar.tsx:187](src/components/layout/sidebar.tsx#L187) | Beide auf `bg-foreground/55` |
| b | `DialogFooter` hat `sm:space-x-2`, aber keinen Abstand im Mobile-Stack (`flex-col-reverse`) | [dialog.tsx:58](src/components/ui/dialog.tsx#L58) | `gap-2` ergänzen, `space-x-2` entfernen |
| c | Close-Button des Dialogs sagt `sr-only` „Close" — einzige englische UI-Zeichenkette | [dialog.tsx:45](src/components/ui/dialog.tsx#L45) | → „Schließen" |
| d | `Checkbox` hat `border-primary` (immer orange), `Input`/`Select` haben `border-input` | [checkbox.tsx:15](src/components/ui/checkbox.tsx#L15) | → `border-input`, `data-[state=checked]:border-primary` |
| e | `Avatar`-Komponente existiert, wird nirgends verwendet — Header baut Initialen-Tile selbst | [avatar.tsx](src/components/ui/avatar.tsx), [header.tsx:103](src/components/layout/header.tsx#L103) | Entweder Header umstellen oder Datei löschen |
| f | `TableRow`-Hover (`hover:bg-secondary`) greift auch auf `<thead>`-Zeilen; `finances-section` arbeitet mit `hover:bg-secondary` dagegen an | [table.tsx:40](src/components/ui/table.tsx#L40), [finances-section.tsx:461](src/app/(app)/projects/[id]/finances-section.tsx#L461) | Hover im Primitive auf `tbody tr` einschränken |
| g | Radien gemischt: Badge `rounded-[5px]`, Button `rounded-md` (7 px), Card `rounded-lg` (9 px), Header-Avatar `rounded-[7px]`, Icon-Buttons in `group-table` `rounded-[5px]` bzw. `rounded-md` | mehrere | Radius-Skala dokumentieren (5/7/9) und Ad-hoc-Werte darauf mappen |
| h | Handgebaute Chip-Buttons haben **keinen** Focus-Style | [filter-controls.tsx:130,152](src/components/filters/filter-controls.tsx#L130), [group-table.tsx:34,219,317,344](src/components/project/group-table.tsx#L34) | `focus-visible:ring-2 focus-visible:ring-ring` ergänzen |
| i | Rohes `<input type="checkbox">` statt `Checkbox` | [quotes-table.tsx:184](src/app/(app)/finances/quotes-table.tsx#L184) | `Checkbox` verwenden |

---

## B. Seitengerüst (Page Shell)

### B1 — Drei verschiedene Listenseiten-Gerüste 🔴

Für die identische Aufgabe „Liste mit Filter und Primäraktion anzeigen" gibt es drei
Aufbauten:

**Variante 1 — Card im Client-Component, Filter *in* der Card** (Referenz, gewünscht):
```
Card
├── CardHeader   → CardTitle + Primäraktion (rechts)
├── div          → Filterleiste (px-4 pb-3)
└── CardContent  → div.rounded-lg.border > Table
```
[projects-table.tsx:191](src/app/(app)/projects/projects-table.tsx#L191), [forecast-view.tsx:217](src/app/(app)/finances/forecast/forecast-view.tsx#L217)

**Variante 2 — Card in `page.tsx`, Filter *im* Content, Aktion in der Filterzeile:**
[customers](src/app/(app)/customers/page.tsx#L14) · [persons](src/app/(app)/persons/page.tsx#L39) · [services](src/app/(app)/services/page.tsx#L26) · [material-Tabs](src/app/(app)/material/page.tsx#L121)

**Variante 3 — Aktion frei über der Card, Tabelle ohne Filter:**
[users/page.tsx:27](src/app/(app)/users/page.tsx#L27) · [material/page.tsx:96](src/app/(app)/material/page.tsx#L96) („Prüfungsmodus")

**Zu tun:** Gemeinsame Shell-Komponente `src/components/layout/list-card.tsx`:
```tsx
<ListCard
  title="Kunden"
  info="…"                    // InfoHint
  action={<CustomerDialog />}  // Primäraktion, immer oben rechts
  filters={<>…</>}             // Bausteine aus filter-controls
  count={{ shown: filtered.length, total: rows.length }}
>
  <Table density="comfortable">…</Table>
</ListCard>
```
Danach alle 10 Listenseiten darauf umstellen. Das löst B1, B2, D1–D4, E2 und G1 in einem Zug.

### B2 — Primäraktion sitzt an fünf verschiedenen Stellen 🔴

| Seite | Position der Primäraktion |
|---|---|
| Projekte | `CardHeader`, rechts ✅ |
| Kunden, Personen, Positionen, Kabel, Geräte, Packeinheiten | in der Filterzeile via `ml-auto` |
| Benutzer | freistehend über der Card |
| Material | „Prüfungsmodus" freistehend über den Tabs |
| Lagerorte | in einer eigenen Section-Header-Zeile ([locations-section.tsx:13](src/app/(app)/material/locations-section.tsx#L13)) |
| Projekt-Tabs (Material/Personal/Kosten/Finanzen) | freistehend über der Card, rechts |

**Zu tun:** Regel festlegen und umsetzen — **Primäraktion immer oben rechts im Card-Header**,
Sekundäraktionen (Download, Prüfungsmodus) links davon als `variant="outline"`.

### B3 — `space-y` der Seiten-Container inkonsistent 🟡

`space-y-6` (Dashboard, Kunden, Personen, Positionen, Benutzer, Settings, Kalender, alle
Detailseiten, `finances/*`) · `space-y-3` ([projects/page.tsx:67](src/app/(app)/projects/page.tsx#L67)) ·
`space-y-4` ([invoices-table.tsx:177](src/app/(app)/finances/invoices-table.tsx#L177), [quotes-table.tsx:135](src/app/(app)/finances/quotes-table.tsx#L135), [finances-section.tsx:430](src/app/(app)/projects/[id]/finances-section.tsx#L430)) ·
`space-y-3` ([forecast-view.tsx:191](src/app/(app)/finances/forecast/forecast-view.tsx#L191))

**Zu tun:** Einheitlich `space-y-4`. (6 ist bei der kompakten Redesign-Typografie zu luftig,
3 zu eng — die zwei jüngsten Seiten Projekte/Forecast haben 3 bzw. 4 gewählt.)

### B4 — Leere Layout-Reste von entfernten Seiten-Headern 🟢

Beim Umzug des Seitentitels in den [Header](src/components/layout/header.tsx#L29) sind leere
Container und Leerzeilen stehen geblieben:

| Datei | Zeile | Rest |
|---|---|---|
| [customers/page.tsx](src/app/(app)/customers/page.tsx#L13) | 13 | Leerzeile in `space-y-6` |
| [services/page.tsx](src/app/(app)/services/page.tsx#L25) | 25 | Leerzeile |
| [settings/page.tsx](src/app/(app)/settings/page.tsx#L79) | 79 | Leerzeile |
| [page.tsx (Dashboard)](src/app/(app)/page.tsx#L36) | 36 | Leerzeile |
| [calendar/page.tsx](src/app/(app)/calendar/page.tsx#L113) | 113 | Leerzeile |
| [finances/quotes/page.tsx](src/app/(app)/finances/quotes/page.tsx#L34) | 34 | Leerzeile |
| [finances/invoices/page.tsx](src/app/(app)/finances/invoices/page.tsx#L37) | 37 | Leerzeile |
| [finances/pending/page.tsx](src/app/(app)/finances/pending/page.tsx#L42) | 42 | Leerzeile |
| [users/page.tsx](src/app/(app)/users/page.tsx#L27) | 27 | `<div className="flex items-center justify-end">` nur für den Dialog |
| [material/page.tsx](src/app/(app)/material/page.tsx#L96) | 96 | `<div className="flex items-start justify-end gap-4">` nur für einen Button |

Kosmetisch, aber sie erzeugen sichtbaren Leerraum unterschiedlicher Höhe oben auf den Seiten.

### B5 — „Projekt anlegen" existiert zweimal mit unterschiedlicher UI 🟡

- Dialog: [project-dialog.tsx](src/app/(app)/projects/project-dialog.tsx) (`max-w-3xl`), von der Liste aus
- Eigene Seite: [projects/new/page.tsx](src/app/(app)/projects/new/page.tsx) (`max-w-3xl` Container, eigene `<h1>`)

Analog bei Packeinheiten: [pack-unit-dialog.tsx](src/app/(app)/pack-units/pack-unit-dialog.tsx) + [pack-units/new/page.tsx](src/app/(app)/pack-units/new/page.tsx).

Beide `new`-Seiten rendern eine **eigene `<h1>`**, obwohl der App-Header schon
„Projekte" / „Material" anzeigt → doppelte Überschrift. Zusätzlich hat
`pack-units/new` einen „Zurück"-Button, `projects/new` keinen.

**Zu tun:** Entscheiden — entweder die `new`-Seiten entfernen (Dialog genügt) oder die
Dialoge. Wenn die Seiten bleiben: Titel in die `TITLES`-Map des Headers aufnehmen,
eigene `<h1>` entfernen, „Zurück" bei beiden ergänzen.

---

## C. Detailseiten-Header

### C1 — Zwei Header-Muster für dieselbe Aufgabe 🔴

**Muster A** (4 Seiten): „Zurück" als eigene Zeile, dann Titel-Block mit Aktionen rechts.
```tsx
<div className="flex items-center gap-2">
  <Button variant="ghost" size="sm" asChild><Link …><ArrowLeft/> Zurück</Link></Button>
</div>
<div className="flex items-start justify-between">
  <div>
    <div className="flex items-center gap-3">
      <h1 className="text-[21px] font-extrabold tracking-tight">{name}</h1>
      <Badge …/>
    </div>
    <p className="text-sm text-muted-foreground">{subtitle}</p>
  </div>
  <div className="flex gap-2">{actions}</div>
</div>
```
[devices/[id]:49](src/app/(app)/devices/[id]/page.tsx#L49) · [pack-units/[id]:107](src/app/(app)/pack-units/[id]/page.tsx#L107) · [cables/[id]:84](src/app/(app)/material/cables/[id]/page.tsx#L84) · [projects/[id]:664](src/app/(app)/projects/[id]/page.tsx#L664)

**Muster B** (1 Seite): alles in einer Zeile, „Zurück" als Icon-Button, Titel als `<h2>` mit
Icon und `text-lg font-bold` statt `text-[21px] font-extrabold`.
[persons/[id]:116](src/app/(app)/persons/[id]/page.tsx#L116)

**Zu tun:** `src/components/layout/detail-header.tsx` extrahieren:
```tsx
<DetailHeader
  backHref="/persons" backLabel="Zurück"
  title={person.name}
  badges={[…]} subtitle={…} actions={<PersonEditButton …/>}
/>
```
und alle fünf Detailseiten darauf umstellen. Muster A ist die Referenz (3:1 Mehrheit + jüngste Seite).

### C2 — Innerhalb der KPI-Karten von `projects/[id]` zwei Wertgrößen 🟡

In [projects/[id]/page.tsx:705–755](src/app/(app)/projects/[id]/page.tsx#L705) stehen vier
gleichrangige Karten nebeneinander, aber:
- „Planung", „Berechnung" → Wert als `text-sm font-medium`
- „Gewicht", „Gesamtpreis" → Wert als `text-2xl font-bold`

Außerdem wird das Label als `CardDescription` gerendert, während die Dashboard-KPI-Karten
dafür `CardTitle` benutzen — gleiche Rolle, zwei Komponenten.

**Zu tun:** Auf die gemeinsame `StatTile` aus **G4** umstellen. Datumsangaben dürfen dort
als `size="sm"`-Variante kleiner bleiben, aber nach einer Regel, nicht ad hoc.

---

## D. Filterleiste & Suche 🔴 — höchste Priorität

`src/components/filters/filter-controls.tsx` ist bereits die gemeinsame Bibliothek, wird aber
nur von **2 von 12** Filterleisten genutzt (Projekte, Forecast).

### D1 — Drei Such-Implementierungen

| Variante | Aussehen | Vorkommen |
|---|---|---|
| **`FilterSearch`** ✅ | Icon `left-2.5 top-1/2 -translate-y-1/2 text-faint`, Input `h-[34px] w-[210px] pl-8` | [projects-table:199](src/app/(app)/projects/projects-table.tsx#L199) |
| **Handgebaut mit Icon** | Icon `left-2 top-2.5 text-muted-foreground`, Input `w-72 pl-8` (36 px) | [persons:132](src/app/(app)/persons/persons-table.tsx#L132) · [services:108](src/app/(app)/services/services-table.tsx#L108) · [cables:114](src/app/(app)/material/cables-section.tsx#L114) · [invoices:210](src/app/(app)/finances/invoices-table.tsx#L210) · [quotes:144](src/app/(app)/finances/quotes-table.tsx#L144) · [pending:67](src/app/(app)/finances/pending/pending-table.tsx#L67) · [items-manager:194,395](src/app/(app)/pack-units/[id]/items-manager.tsx#L194) · [assignments:1373](src/app/(app)/projects/[id]/assignments-section.tsx#L1373) · [services-section:1024](src/app/(app)/projects/[id]/services-section.tsx#L1024) |
| **Ohne Icon** | nur `Input className="max-w-xs"` | [customers:54](src/app/(app)/customers/customers-table.tsx#L54) · [devices-section:98](src/app/(app)/material/devices-section.tsx#L98) · [pack-units-section:116](src/app/(app)/material/pack-units-section.tsx#L116) |

Nebeneffekt: Icon-Farbe (`text-faint` vs. `text-muted-foreground`) und Feldbreite
(210 / 288 / `max-w-xs` = 320 px) unterscheiden sich sichtbar zwischen Seiten.

**Zu tun:** Alle 14 Stellen auf `FilterSearch` umstellen. Für Panels ein
`className="flex-1"` / `fullWidth`-Prop ergänzen (Katalog-Spalten in
`assignments-section`/`services-section` brauchen 100 % Breite).

### D2 — Drei Reset-Buttons

| Variante | Vorkommen |
|---|---|
| **`FilterResetButton`** ✅ (26-px-Chip, Hover destructive, nur sichtbar wenn ≠ Default) | [projects-table:212](src/app/(app)/projects/projects-table.tsx#L212), [forecast-view:263](src/app/(app)/finances/forecast/forecast-view.tsx#L263) |
| `Button variant="ghost" size="sm"` + `X` + „Filter zurücksetzen" | [customers:61](src/app/(app)/customers/customers-table.tsx#L61) · [persons:141](src/app/(app)/persons/persons-table.tsx#L141) · [services:117](src/app/(app)/services/services-table.tsx#L117) · [cables:123](src/app/(app)/material/cables-section.tsx#L123) · [pack-units:123](src/app/(app)/material/pack-units-section.tsx#L123) · [invoices:219](src/app/(app)/finances/invoices-table.tsx#L219) · [quotes:194](src/app/(app)/finances/quotes-table.tsx#L194) · [pending:76](src/app/(app)/finances/pending/pending-table.tsx#L76) |
| Nur `X`-Icon, ohne Text | [services-section:1045](src/app/(app)/projects/[id]/services-section.tsx#L1045) |

Zusätzlich fehlt in [devices-section](src/app/(app)/material/devices-section.tsx#L97) ein
Reset-Button ganz, obwohl die Nachbar-Tabs (Packeinheiten, Kabel) einen haben.

**Zu tun:** `FilterResetButton` überall; Label einheitlich „Zurücksetzen".

### D3 — Vier Status-Filter-Konzepte für dieselbe Aufgabe

| Konzept | Wo | Aussehen |
|---|---|---|
| **`StatusChips`** ✅ getönte Mehrfachauswahl-Chips mit Häkchen | Projekte, Forecast | 26 px, `*-subtle`-Töne |
| `FilterButton` — `Button variant={active?"default":"outline"} size="sm"` mit Count | [quotes-table:357](src/app/(app)/finances/quotes-table.tsx#L357) | 30 px, gefüllt orange wenn aktiv |
| Klickbare `StatCard`-Kacheln als Filter | [invoices-table:179](src/app/(app)/finances/invoices-table.tsx#L179) | große KPI-Kacheln mit `ring-2` |
| `Select`-Dropdown | [timeline:252](src/app/(app)/calendar/timeline.tsx#L252) | 36 px Dropdown |

**Zu tun:** `StatusChips` generalisieren (`items: {value,label,count,tone}[]`, `multi?: boolean`)
und für Angebot-Status, Rechnungs-Status und Kalender-Status verwenden. Die KPI-Kacheln in
`invoices-table` bleiben Kacheln, verlieren aber die Filterfunktion (oder behalten sie
zusätzlich zu den Chips — dann aber ohne dass sie *das einzige* Filterelement sind).

### D4 — Ergänzende Filter-Features nur punktuell vorhanden 🟡

| Feature | Vorhanden in | Fehlt in |
|---|---|---|
| Trefferzähler `{n} von {m}` | invoices, quotes, pending | Projekte, Kunden, Personen, Positionen, Material-Tabs, Forecast |
| Filter-Persistenz (localStorage, pro Profil) | Projekte, Forecast | allen anderen |
| Zeitraum-Filter (`DateRangeControls`) | Projekte, Forecast | Rechnungen, Angebote, Zu-fakturieren (dort wäre er fachlich sinnvoll) |
| `FilterDivider` | Projekte, Forecast | allen anderen |

**Zu tun:** Trefferzähler und Persistenz in die `ListCard`-Shell (**B1**) ziehen, damit sie
automatisch überall gelten. Persistenz-Key-Schema vereinheitlichen: `devo:<seite>-filter:<userId>`
(so schon in [projects-table:92](src/app/(app)/projects/projects-table.tsx#L92) und [forecast-view:83](src/app/(app)/finances/forecast/forecast-view.tsx#L83)).

### D5 — Placeholder-Texte 🟢

`"Suche…"` (8×, unspezifisch) vs. sprechende Varianten `"Name oder Kunde…"`,
`"Nummer, Projekt oder Kunde…"`, `"Projekt oder Kunde…"`, `"Name, Typ, Stecker…"`,
`"Gerät oder Kabel suchen…"`.

**Zu tun:** Sprechende Placeholder überall — sie sagen dem Nutzer, welche Felder durchsucht
werden (was pro Tabelle wirklich unterschiedlich ist). Schema: `"<Feld>, <Feld> oder <Feld>…"`.
Damit entfallen die 8 generischen `"Suche…"`.

---

## E. Tabellen

### E1 — Fünf Dichte-Varianten als Utility-Strings 🔴

| Dichte-String | Ergebnis | Vorkommen |
|---|---|---|
| `[&_td]:py-2 [&_td]:px-3 [&_th]:h-10 [&_th]:px-3` | „komfortabel" | 7× (customers, persons, services, devices-section, cables-section, pack-units-section, serial-numbers, cable-units-editor) |
| `[&_td]:px-3 [&_td]:py-1.5` | „kompakt" (Header bleibt 32 px) | 5× (invoices, quotes, pending, forecast, time-entries) |
| `[&_td]:px-2 [&_td]:py-1` | „dicht" | ~12× (alle Projekt-Sektionen) |
| `[&_td]:py-1.5 [&_td]:px-2 [&_th]:h-8 [&_th]:px-2` | „dicht, eigener Header" | [inspection-scanner:293](src/app/(app)/material/inspection/inspection-scanner.tsx#L293) |
| *(kein Override)* | Primitive-Default | [users/page:36](src/app/(app)/users/page.tsx#L36), [locations-table:37](src/app/(app)/locations/locations-table.tsx#L37), [devices/[id]:152,190](src/app/(app)/devices/[id]/page.tsx#L152) |

**Zu tun:** `density`-Prop in [table.tsx](src/components/ui/table.tsx) einführen:
```tsx
const densities = {
  comfortable: "[&_td]:px-3 [&_td]:py-2 [&_th]:h-10 [&_th]:px-3",
  compact:     "[&_td]:px-3 [&_td]:py-1.5 [&_th]:h-9 [&_th]:px-3",
  dense:       "[&_td]:px-2 [&_td]:py-1 [&_th]:h-8 [&_th]:px-2",
} as const;
```
Regel: **`comfortable` = Stammdaten-Listen · `compact` = Finanz-/Zeitlisten · `dense` = Projekt-Zuordnungstabellen.**
Alle 25 Ad-hoc-Strings ersetzen, insbesondere die drei Tabellen ohne Override.

### E2 — Tabellenrahmen: mal ja, mal nein 🟡

Mit Rahmen (`<div className="overflow-hidden rounded-lg border">`):
[projects-table:216](src/app/(app)/projects/projects-table.tsx#L216) · [invoices:236](src/app/(app)/finances/invoices-table.tsx#L236) · [quotes:211](src/app/(app)/finances/quotes-table.tsx#L211) · [pending:86](src/app/(app)/finances/pending/pending-table.tsx#L86) · [forecast:272](src/app/(app)/finances/forecast/forecast-view.tsx#L272) · [costs-section:870](src/app/(app)/projects/[id]/costs-section.tsx#L870)

Ohne Rahmen (Tabelle klebt am Card-Rand):
customers · persons · services · devices-section · cables-section · pack-units-section · users · locations · files-section · serial-numbers

**Zu tun:** Rahmen in die `ListCard`-Shell (**B1**) bzw. als `bordered`-Prop ins `Table`-Primitive.
Der Rahmen ist das Redesign-Muster (alle jüngeren Seiten haben ihn).

### E3 — Gruppen-Kopfzeile 5× kopiert, mit Drift 🟡

Der Block „Chevron + Ordner-Icon + Name + `(count)`" ist praktisch identisch in fünf Dateien:

| Datei | Zeilen | Einrückungsfaktor |
|---|---|---|
| [devices-section](src/app/(app)/material/devices-section.tsx#L137) | 137–164 | `depth * 1.5rem` |
| [pack-units-section](src/app/(app)/material/pack-units-section.tsx#L165) | 165–192 | `depth * 1.5rem` |
| [cables-section](src/app/(app)/material/cables-section.tsx#L166) | 166–193 | **`depth * 1.25rem`** ⚠️ |
| [services-table](src/app/(app)/services/services-table.tsx#L156) | 156–178 | fix `2.5rem` für Kinder |
| [persons-table](src/app/(app)/persons/persons-table.tsx#L176) | 176–198 | fix `2.5rem` für Kinder |

Die Kabel-Tabelle rückt Unterkategorien also anders ein als Geräte und Packeinheiten —
direkt nebeneinander in denselben Material-Tabs sichtbar.

**Zu tun:** `src/components/ui/table-group-row.tsx` extrahieren:
```tsx
<TableGroupRow colSpan={6} depth={g.depth} collapsed={…} count={g.items.length}
               label={g.name} onToggle={…} />
```
Einrückung als Konstante (`INDENT_REM = 1.5`) darin kapseln, inkl. der Kind-Zeilen-Einrückung
(`1 + (depth+1) * INDENT_REM`).

### E4 — Empty-State-Zellen: Text, Größe und Interpunktion driften 🟡

| Klassen | Vorkommen |
|---|---|
| `text-center text-muted-foreground py-8` (→ erbt `text-[13px]`) | projects, customers, pack-units-section, locations |
| `py-8 text-center text-sm text-muted-foreground` (→ 14 px) | persons, services, cables, devices-section, invoices, quotes, pending |
| `py-3 text-center text-xs text-muted-foreground` | [costs-section:808](src/app/(app)/projects/[id]/costs-section.tsx#L808) |
| `px-3 py-8 text-center text-xs text-muted-foreground` | [assignments-section:1389](src/app/(app)/projects/[id]/assignments-section.tsx#L1389) |

Interpunktion: „Keine Treffer für die Suche" (ohne Punkt) vs. „Keine Treffer für die Suche."
(mit Punkt, in quotes/pending) vs. „Keine Treffer" (assignments) vs. „Keine Treffer für diese
Filter" (projects).

**Zu tun:** `<TableEmpty colSpan={n} hasData={rows.length>0} entity="Kunden" />`-Helper:
```
kein Datensatz vorhanden → „Noch keine {entity} angelegt."
Filter greift            → „Keine Treffer für die aktuellen Filter."
```
Immer mit Punkt, immer `py-8 text-center text-sm text-muted-foreground`.

### E5 — Zeilen-Klickverhalten unterschiedlich 🟡

| Tabelle | Klick auf die Zeile |
|---|---|
| Projekte | navigiert zum Projekt (`cursor-pointer` + `router.push`) |
| Packeinheiten | klappt den Inhalt auf/zu |
| Kunden, Personen, Positionen, Geräte, Kabel, Rechnungen, Angebote, Benutzer, Lagerorte | nichts — nur der Link in der Namensspalte |

**Zu tun:** Regel wählen. Empfehlung: **Zeile klickbar überall, wo es eine Detailseite gibt**
(Projekte, Geräte, Packeinheiten, Kabel, Personen), mit `cursor-pointer` als Signal.
Tabellen ohne Detailseite (Kunden, Positionen, Benutzer, Lagerorte, Rechnungen) bleiben
nicht-klickbar. Wichtig: bei klickbaren Zeilen `e.stopPropagation()` an allen Aktionen —
in [pack-units-section:270](src/app/(app)/material/pack-units-section.tsx#L270) korrekt gelöst,
das ist die Referenz.

### E6 — Kleinigkeiten 🟢

| # | Finding | Fix |
|---|---|---|
| a | Aktionsspaltenbreite: `w-[90px]`, `w-[100px]`, `w-[120px]`, `w-[130px]`, `w-[220px]` | Nach Anzahl Aktionen ableiten: 2 Icons = `w-[76px]`, 3 = `w-[110px]` |
| b | `colSpan` der Empty-Row überall handgepflegt — bricht beim Spalten-Hinzufügen | In `TableEmpty` (**E4**) zentralisieren |
| c | Keine Tabelle ist per Spaltenkopf sortierbar; bei Rechnungen und Projekten ist das spürbar | Optional: `SortableTableHead` |
| d | `text-sm` auf einzelnen `TableCell`s, obwohl das Primitive `text-[13px]` setzt → 14 px statt 13 px in Datumsspalten | `text-sm`-Overrides in Zellen entfernen |

---

## F. Aktions-Buttons in Tabellenzeilen 🔴

### F1 — Drei Größen für dieselbe Aktion

| Größe | Effektiv | Vorkommen |
|---|---|---|
| `size="icon"` (Default) | **34 × 34** | customers · devices-section · cables-section · pack-units-section · locations · users |
| `size="icon" className="h-8 w-8"` | **32 × 32** | persons · services · notes-section · time-entries · serial-numbers · letterhead · items-manager |
| `size="icon" className="h-7 w-7"` | **28 × 28** | invoices · quotes · finances-section · costs-section · assignments-section · services-section · files-section · categories-tree · periods-section · pack-units-section (Chevron) |

Alle drei sind „Bearbeiten / Löschen in einer Tabellenzeile" — identische Aufgabe.

**Zu tun:** `size`-Varianten am Button ergänzen und die Regel an die Tabellen-Dichte koppeln:
```ts
size: {
  icon:    "h-[34px] w-[34px]",  // comfortable
  iconSm:  "h-8 w-8",            // compact
  iconXs:  "h-7 w-7",            // dense
}
```
Danach alle `className="h-7 w-7"` / `"h-8 w-8"` durch die Variante ersetzen (≈ 40 Stellen).

### F2 — Löschen-Button mal rot, mal grau 🔴

**Rot** (`text-destructive hover:text-destructive`), 13 Dateien: persons · services ·
invoices · quotes · finances-section · costs-section · assignments-section · services-section ·
notes-section · files-section · time-entries · letterhead-form · einsatz-client

**Grau** (Default-Ghost), 7 Dateien: [customers:134](src/app/(app)/customers/customers-table.tsx#L134) ·
[devices-section:209](src/app/(app)/material/devices-section.tsx#L209) ·
[cables-section:245](src/app/(app)/material/cables-section.tsx#L245) ·
[pack-units-section:276](src/app/(app)/material/pack-units-section.tsx#L276) ·
[locations-table:66](src/app/(app)/locations/locations-table.tsx#L66) ·
[users/user-actions:41](src/app/(app)/users/user-actions.tsx#L41) ·
[periods-section:150](src/app/(app)/projects/[id]/periods-section.tsx#L150)

Die Stammdaten-Bereiche (Material, Kunden, Lagerorte, Benutzer) sind also durchgehend grau,
alles Neuere rot. Nutzer bekommen für dieselbe destruktive Aktion unterschiedlich starke
Signale.

**Zu tun:** `destructive`-Ghost-Variante am Button einführen
(`variant="ghostDestructive"`: `text-destructive hover:bg-destructive-subtle hover:text-destructive`)
und **überall** verwenden. Nebeneffekt: der Hover-Hintergrund wird einheitlich (heute hat
nur [group-table:224](src/components/project/group-table.tsx#L224) `hover:bg-destructive-subtle`).

### F3 — `title`/`aria-label` fehlen teilweise 🟡

Ohne jedes Tooltip/Label:
[users/user-actions:38,41](src/app/(app)/users/user-actions.tsx#L38) ·
[locations-table:63,66](src/app/(app)/locations/locations-table.tsx#L63) ·
[pack-units-section:210](src/app/(app)/material/pack-units-section.tsx#L210) (Chevron) ·
[categories-tree:138,147,156](src/app/(app)/settings/categories-tree.tsx#L138)

Alle anderen setzen `title="Bearbeiten"` / `title="Löschen"`.

**Zu tun:** `title` **und** `aria-label` bei allen Icon-Buttons. Am besten über eine
`<RowActions>`-Komponente (siehe F5), die das erzwingt.

### F4 — „Bearbeiten"-Stift navigiert statt zu öffnen 🟡

In den Material-Tabs ist der Stift ein `<Link>` zur Detailseite, nicht ein Dialog-Trigger:
[devices-section:204](src/app/(app)/material/devices-section.tsx#L204) ·
[cables-section:240](src/app/(app)/material/cables-section.tsx#L240) ·
[pack-units-section:271](src/app/(app)/material/pack-units-section.tsx#L271)

Überall sonst öffnet der Stift einen Bearbeiten-Dialog (customers, persons, services, users,
locations, notes, time-entries). Bei Personen gibt es zusätzlich einen separaten
`ExternalLink`-Button für die Detailseite ([persons-table:240](src/app/(app)/persons/persons-table.tsx#L240)) —
das einzige Vorkommen dieses Buttons in der App.

**Zu tun:** Stift = Dialog, überall. Für Geräte/Kabel/Packeinheiten existieren die Dialoge
bereits ([device-dialog](src/app/(app)/devices/device-dialog.tsx), [cable-dialog](src/app/(app)/material/cable-dialog.tsx),
[pack-unit-dialog](src/app/(app)/pack-units/pack-unit-dialog.tsx)) — sie werden dort nur nicht
verwendet. Navigation zur Detailseite läuft über den Namens-Link bzw. den Zeilen-Klick (**E5**).
Den `ExternalLink`-Button in `persons-table` dann entfernen.

### F5 — Empfehlung: `<RowActions>`-Komponente 🟢

```tsx
<RowActions density="compact">
  <RowAction icon={Pencil}  label="Bearbeiten" onClick={…} />
  <RowAction icon={Trash2}  label="Löschen"    onClick={…} destructive />
</RowActions>
```
Kapselt F1 (Größe), F2 (Farbe), F3 (a11y), `flex justify-end gap-1` und
`onClick={e => e.stopPropagation()}` bei klickbaren Zeilen (**E5**). Ersetzt ~20 kopierte
Blöcke.

---

## G. Karten & KPI-Kacheln

### G1 — Zwei Card-Padding-Rhythmen 🟡

**Standard:** `<Card>` + `<CardHeader>` (px-4 py-3) + `<CardContent>` (p-4 pt-0) — überwiegend.

**Selbstgebaut:** `<Card className="p-4">` mit `<CardHeader className="px-0 pt-0 pb-3">` und
`<CardContent className="px-0 pb-0">`:
[assignments-section:1357](src/app/(app)/projects/[id]/assignments-section.tsx#L1357) ·
[services-section:1002](src/app/(app)/projects/[id]/services-section.tsx#L1002) ·
[notes-section:110](src/app/(app)/projects/[id]/notes-section.tsx#L110) ·
[costs-section:829](src/app/(app)/projects/[id]/costs-section.tsx#L829)

Effekt: In den Projekt-Tabs sitzt der Card-Titel 4 px weiter innen als überall sonst.

**Zu tun:** Die vier Sektionen auf das Standard-Muster bringen. Falls der Grund die
`max-h`-Klammer war (`lg:max-h-[calc(100vh-80px)] lg:overflow-hidden`), lässt sich das auch
mit dem Standard-Padding erreichen.

### G2 — Verschachtelte Karten (doppelter Rahmen) 🟡

| Stelle | Verschachtelung |
|---|---|
| [notes-section:110→144](src/app/(app)/projects/[id]/notes-section.tsx#L110) | `Card p-4` → `CardContent` → **`Card`** pro Notiz |
| [notes-section:129](src/app/(app)/projects/[id]/notes-section.tsx#L129) | `Card p-4` → **`Card`** (Empty-State) |
| [assignments-section:1367](src/app/(app)/projects/[id]/assignments-section.tsx#L1367) | `Card p-4` → `Card border-0 shadow-none` (Workaround, um den Rahmen wieder loszuwerden) |
| [services-section:1012](src/app/(app)/projects/[id]/services-section.tsx#L1012) | dito |

Dass in zwei Fällen `border-0 shadow-none` nötig ist, zeigt: hier wird `Card` als Layout-Box
missbraucht. Bei `notes-section` bleibt der doppelte Rahmen sichtbar.

**Zu tun:** Innen-Cards durch `<div>` bzw. `<section>` ersetzen; Notiz-Einträge als
`divide-y`-Liste im äußeren Card-Content rendern (Muster wie
[persons/[id]:195](src/app/(app)/persons/[id]/page.tsx#L195)).

### G3 — Empty-State-Karten: zwei Ausprägungen 🟢

Nur Text, zentriert (`py-12 text-center text-sm text-muted-foreground`):
[quotes/page:37](src/app/(app)/finances/quotes/page.tsx#L37) · [invoices/page:40](src/app/(app)/finances/invoices/page.tsx#L40) ·
[pending/page:45](src/app/(app)/finances/pending/page.tsx#L45) · [finances-section:445](src/app/(app)/projects/[id]/finances-section.tsx#L445)

Mit Icon + Call-to-Action-Button:
[notes-section:129](src/app/(app)/projects/[id]/notes-section.tsx#L129) · [services-section:1204](src/app/(app)/projects/[id]/services-section.tsx#L1204)

**Zu tun:** `<EmptyState icon={…} title={…} hint={…} action={…} />`-Komponente; Icon + CTA
überall, wo eine sinnvolle Erstaktion existiert (das ist bei allen sechs der Fall).

### G4 — Drei separate `StatCard`-Implementierungen 🔴

| Datei | Element | Label | Wert | Besonderheit |
|---|---|---|---|---|
| [page.tsx:106](src/app/(app)/page.tsx#L106) (Dashboard) | `Link` > `Card` | `CardTitle text-xs font-semibold text-muted-foreground` | `text-[27px] font-extrabold` | 3-px-Akzentbalken links, Icon rechts |
| [invoices-table.tsx:415](src/app/(app)/finances/invoices-table.tsx#L415) | `<button>` | `text-xs font-medium uppercase tracking-wide opacity-80` | `text-2xl font-bold tabular-nums` | farbiger Rahmen, `ring-2` wenn aktiv |
| [forecast-view.tsx:380](src/app/(app)/finances/forecast/forecast-view.tsx#L380) | `<div>` | `text-xs uppercase tracking-wide` | `text-xl font-bold tabular-nums font-mono` | Rahmenfarbe nach Vorzeichen |

Drei Wertgrößen (27 / 24 / 20 px), zwei Label-Stile, `font-mono` nur im Forecast. Dazu kommen
die vier KPI-Karten in [projects/[id]:705](src/app/(app)/projects/[id]/page.tsx#L705) als
vierte Variante (siehe **C2**).

**Zu tun:** Eine `src/components/ui/stat-tile.tsx`:
```tsx
<StatTile
  label="Offen (Brutto)"
  value={formatCurrency(x)}
  tone="default|success|warning|destructive|muted"
  icon={Receipt}
  href="/finances/invoices"   // optional → wird Link
  onClick={…} active={…}      // optional → wird Filter-Button
/>
```
Werte immer `font-mono tabular-nums` (siehe **K1**), eine Größe, Akzentbalken als Standard.

---

## H. Dialoge

### H1 — Fünf Breiten ohne Regel 🟡

| Breite | Dialoge |
|---|---|
| `max-w-sm` | [assignments:1763](src/app/(app)/projects/[id]/assignments-section.tsx#L1763) · [costs:1092](src/app/(app)/projects/[id]/costs-section.tsx#L1092) · [services:1414](src/app/(app)/projects/[id]/services-section.tsx#L1414) |
| `max-w-md` | [timeline:455](src/app/(app)/calendar/timeline.tsx#L455) · [assignments:1882](src/app/(app)/projects/[id]/assignments-section.tsx#L1882) · [copy-button:90](src/app/(app)/projects/[id]/copy-button.tsx#L90) · [finances:913,1195](src/app/(app)/projects/[id]/finances-section.tsx#L913) · [scan-dialog:113](src/app/(app)/projects/[id]/scan-dialog.tsx#L113) · [services:1360](src/app/(app)/projects/[id]/services-section.tsx#L1360) |
| `max-w-lg` (Default) | ConfirmDialog · user-dialog · location-dialog · MarkPaidDialog · [time-entries:357](src/app/(app)/persons/[id]/time-entries-section.tsx#L357) · [person-assignment:310](src/app/(app)/projects/[id]/person-assignment-dialog.tsx#L310) |
| `max-w-2xl` | device · cable · customer · service · pack-unit · person · [edit-button:33](src/app/(app)/pack-units/[id]/edit-button.tsx#L33) |
| `max-w-3xl` | [project-dialog:33](src/app/(app)/projects/project-dialog.tsx#L33) · [notes-section:271](src/app/(app)/projects/[id]/notes-section.tsx#L271) |

**Zu tun:** `size`-Prop am `DialogContent` mit dokumentierter Regel:
```
sm (max-w-md)  → Bestätigung, 1–2 Felder
md (max-w-lg)  → Standardformular (Default)
lg (max-w-2xl) → Stammdaten-Formular mit Grid
xl (max-w-3xl) → Editor / große Tabelle
```
Und `max-w-sm` ganz eliminieren (zu eng für Buttons + Text).

### H2 — Scroll-Absicherung fehlt bei 14 von 21 Dialogen 🔴

`max-h-[90vh] overflow-y-auto` haben nur: device · cable · customer · service · pack-unit ·
person · pack-unit-edit · person-assignment.

**Nicht** abgesichert, obwohl potenziell hoch:
[project-dialog](src/app/(app)/projects/project-dialog.tsx#L33) (`max-w-3xl`, ganzes Projektformular inkl. Zeiträumen) ·
[notes-section:271](src/app/(app)/projects/[id]/notes-section.tsx#L271) (`max-w-3xl`, Markdown-Editor) ·
[finances-section:913,1195](src/app/(app)/projects/[id]/finances-section.tsx#L913) (Angebot/Rechnung erstellen, mit Gruppenliste) ·
[time-entries:357](src/app/(app)/persons/[id]/time-entries-section.tsx#L357) ·
[person-assignment-dialog](src/app/(app)/projects/[id]/person-assignment-dialog.tsx#L310) ✅ (hat es)

Auf kleinen Laptops sind Abbrechen/Speichern dort nicht erreichbar.

**Zu tun:** `max-h-[90vh] overflow-y-auto` in das `DialogContent`-Primitive verlagern
(als Default), dann alle Overrides entfernen. Besser noch: Header/Footer sticky, nur der
Body scrollt.

### H3 — `DialogDescription` nur in 3 von ~20 Dialogen 🟡

Vorhanden: [location-dialog:76](src/app/(app)/locations/location-dialog.tsx#L76) ·
[MarkPaidDialog](src/app/(app)/finances/invoices-table.tsx#L485) · ConfirmDialog (durchgängig ✅)

Fehlt: customer · device · cable · service · person · user · pack-unit · project · note · …

Radix warnt nicht, aber Screenreader bekommen keinen Kontext, und visuell fehlt der
erklärende Untertitel, den die Card-Header via `InfoHint` überall haben.

**Zu tun:** Entweder überall `DialogDescription` (empfohlen, 1 Satz pro Dialog) oder
konsequent nie + `aria-describedby={undefined}`. Nicht in der Mitte bleiben.

### H4 — Trigger-Labels: „X anlegen" vs. „Neue/r/s X" 🟡

| „X anlegen" ✅ (7×) | „Neu…" (6×) |
|---|---|
| Kunde anlegen · Gerät anlegen · Lagerort anlegen · Packeinheit anlegen · Projekt anlegen · Person anlegen · Position anlegen | Neuer Benutzer · Neues Kabel · Neue Hauptkategorie · Neue Notiz · Neue Position · „Eintrag" |

Bemerkenswert: **„Position anlegen"** ([services-table:127](src/app/(app)/services/services-table.tsx#L127))
und **„Neue Position"** ([services-section:1019](src/app/(app)/projects/[id]/services-section.tsx#L1019))
existieren parallel für dieselbe Entität. Und
[time-entries:253](src/app/(app)/persons/[id]/time-entries-section.tsx#L253) sagt nur „Eintrag".

**Zu tun:** Durchgängig **„<Entität> anlegen"** (Mehrheit + grammatikalisch geschlechtsneutral,
was bei „Neuer/Neue/Neues" pro Wort geprüft werden muss).

### H5 — Validierungs-Feedback in zwei Geschmacksrichtungen 🟡

| Ansatz | Dialoge |
|---|---|
| HTML `required` (Browser-Bubble) | customer · device · user · location · pack-unit |
| `toast.error("Name darf nicht leer sein")` | [service-dialog:71](src/app/(app)/services/service-dialog.tsx#L71) · [person-dialog:94](src/app/(app)/persons/person-dialog.tsx#L94) · [cable-dialog:91](src/app/(app)/material/cable-dialog.tsx#L91) · [assignments-section:752](src/app/(app)/projects/[id]/assignments-section.tsx#L752) |

**Zu tun:** Auf `required` + Inline-Fehlertext unter dem Feld gehen (Toast ist für
Feldvalidierung der falsche Kanal — er erscheint weit weg vom Feld). Mindestens aber
einheitlich einer der beiden Wege.

### H6 — `autoFocus` nur in einem Dialog 🟢

Nur [customer-dialog:122](src/app/(app)/customers/customer-dialog.tsx#L122) fokussiert das
erste Feld.

**Zu tun:** `autoFocus` auf das erste Eingabefeld jedes Formular-Dialogs.

### H7 — Was schon einheitlich ist ✅

Bitte so lassen: `isEdit ? "Speichern" : "Anlegen"` · „Abbrechen" als
`variant="outline"` links · `{pending && <Loader2 className="h-4 w-4 animate-spin" />}` ·
`ConfirmDialog` für **jede** Löschung, mit `<strong>{name}</strong> wird unwiderruflich
gelöscht.`-Formulierung und `confirmLabel="Löschen"` / `"Deaktivieren"`. Das ist die
best-gepflegte Ecke der App.

---

## I. Speichern-Muster 🔴

Vier Modelle koexistieren — für den Nutzer der irritierendste Bruch der App:

| # | Modell | Feedback | Wo |
|---|---|---|---|
| 1 | Dialog + „Speichern" | Toast | alle Stammdaten-Dialoge |
| 2 | Auto-Save (debounce 800 ms) | **`AutoSaveIndicator`** ✅ | [project-form:144](src/app/(app)/projects/project-form.tsx#L144) · [periods-section:75](src/app/(app)/projects/[id]/periods-section.tsx#L75) |
| 3 | Inline-`onBlur` | **keins** ⚠️ | Gruppennamen ([group-table:137](src/components/project/group-table.tsx#L137)) · Zwischenüberschriften ([group-table:208](src/components/project/group-table.tsx#L208)) · Kabel-Barcodes ([cable-units-editor:80](src/app/(app)/material/cables/[id]/cable-units-editor.tsx#L80)) · Gruppen-Rabatt ([finances-section:407](src/app/(app)/projects/[id]/finances-section.tsx#L407)) · `QtyStepper` ([group-table:234](src/components/project/group-table.tsx#L234)) |
| 4 | Card mit eigenem „Speichern" | Toast pro Card | alle 10 Settings-Formulare |

Modell 3 ist das Problem: der Nutzer tippt, verlässt das Feld — und sieht nichts. Bei
Fehlern erscheint ein Toast, bei Erfolg nichts. Genau diese Felder sitzen in den
Projekt-Tabs neben Modell-2-Bereichen, die einen Indikator haben.

**Zu tun:**
1. `AutoSaveIndicator` in die Card-Header aller Bereiche mit Inline-Save aufnehmen
   (Material, Personal & Transport, Zumietung & Kosten, Finanzen, Kabel-Einheiten).
   Ein gemeinsamer „letzte Aktion"-Status pro Sektion genügt.
2. Alternativ (leichter): `useAutoSave` um einen Modus erweitern, der bei Erfolg kurz
   `Gespeichert` einblendet — dann reicht ein Indikator pro Card.
3. Settings-Seite: entweder alle 10 Cards auf Auto-Save umstellen (konsistent mit dem Rest)
   oder so lassen und im Kapitel-Kommentar begründen (Nummernkreise sind riskant, ein
   explizites Speichern ist dort vertretbar). **Empfehlung: so lassen, aber dokumentieren.**

---

## J. Toasts & Fehlermeldungen 🟡

### J1 — Sieben verschiedene Fehler-Titel

| Titel | Vorkommen |
|---|---|
| `"Fehler"` | user-dialog · customer-dialog · device-dialog · location-dialog · category-dialog · user-actions · serial-numbers · items-manager (6×) |
| `"Fehler beim Löschen"` | [locations-table:29](src/app/(app)/locations/locations-table.tsx#L29) |
| `"Fehler beim Speichern"` | [service-dialog:96](src/app/(app)/services/service-dialog.tsx#L96) · [person-dialog:122](src/app/(app)/persons/person-dialog.tsx#L122) · [einsatz-client:330](src/app/einsatz/[token]/einsatz-client.tsx#L330) |
| `"Fehler beim Hochladen"` | [letterhead-form:69](src/app/(app)/settings/letterhead-form.tsx#L69) |
| `"Löschen fehlgeschlagen"` | devices-section · pack-units-section · devices/[id]/delete-button · pack-units/[id]/delete-button |
| `"Löschen nicht möglich"` | customers-table · services-table · persons-table · categories-tree |
| *(nur `e.message`, kein Titel)* | invoices · quotes · cables-section · cable-actions · calendar-feed · inspection-scanner · alle Settings-Formulare · alle Projekt-Sektionen |

Dazu zwei Aufrufformen: `toast.error(titel, { description: msg })` vs. `toast.error(msg)`.
Im ersten Fall steht die technische Meldung klein unter dem Titel, im zweiten groß als Titel.

**Zu tun:** Helper in `src/lib/toast.ts`:
```ts
export function toastError(e: unknown, action: string) {
  toast.error(`${action} fehlgeschlagen`, {
    description: e instanceof Error ? e.message : undefined,
  });
}
// toastError(e, "Löschen") → „Löschen fehlgeschlagen" + Detail
```
Alle ~60 `toast.error`-Aufrufe darauf umstellen. Sonderfall „Löschen nicht möglich" bleibt
sinnvoll, wenn es eine *fachliche* Sperre ist (Kunde hat Projekte) — dafür einen zweiten
Helper `toastBlocked(reason)`.

### J2 — Was schon gut ist ✅

Erfolgsmeldungen sind durchgängig `"<Entität> angelegt"` / `"aktualisiert"` / `"gelöscht"`,
und `toast.info` wird konsistent für „wurde stattdessen deaktiviert" genutzt
([services-table:91](src/app/(app)/services/services-table.tsx#L91), [persons-table:115](src/app/(app)/persons/persons-table.tsx#L115)).
So beibehalten.

---

## K. Zahlen- und Datums-Typografie 🟡

### K1 — `tabular-nums` mal mit, mal ohne `font-mono`

36 Vorkommen ohne `font-mono`, 67 mit. Die Trennlinie verläuft nach Bereich, nicht nach
Bedeutung:

| Bereich | Geldbeträge |
|---|---|
| Finanzen (Rechnungen, Angebote, Forecast, Projekt-Finanzen) | `font-mono tabular-nums` ✅ |
| Material (`€ / Tag` in devices-section, cables-section, pack-units-section) | nur `tabular-nums` ⚠️ |
| Personal (`Satz` in persons-table) | `font-mono` ✅ |
| Positionen (`Preis` in services-table) | `font-mono` ✅ |

Damit sehen identische Euro-Beträge in Material-Tabs anders aus als in Finanz-Tabellen.

Der erklärte Design-Intent steht im Code: *„JetBrains Mono für Zahlen, Datums- und
Nummernkreis-Spalten"* ([tailwind.config.ts:28](tailwind.config.ts#L28)) — Datumsspalten sind
nirgends mono.

**Zu tun:**
1. Utility-Klassen in [globals.css](src/app/globals.css) definieren:
   ```css
   @layer utilities {
     .num  { @apply font-mono tabular-nums; }
     .num-strong { @apply font-mono tabular-nums font-medium; }
   }
   ```
2. Alle Geld- und Mengenzellen auf `.num` umstellen (ersetzt 103 Ad-hoc-Kombinationen).
3. Entscheiden, ob Datumsspalten mono werden. **Empfehlung: nein** — der Intent-Kommentar
   sollte stattdessen auf „Beträge, Mengen und Nummernkreise" korrigiert werden, sonst bleibt
   er dauerhaft unerfüllt.

### K2 — Negative Beträge auf zwei Wege dargestellt 🟢

- Forecast: `"−" + formatCurrency(r.costs)` — typografisches Minus als Präfix
  ([forecast-view:317,351](src/app/(app)/finances/forecast/forecast-view.tsx#L317))
- finances-section: `discount > 0 ? "−" + formatCurrency(discount) : "—"` — gleiche Technik
  ([finances-section:415](src/app/(app)/projects/[id]/finances-section.tsx#L415))
- Sonst: `formatCurrency(negativeZahl)` → `Intl` liefert `-1.234,00 €` mit ASCII-Hyphen

**Zu tun:** `formatCurrencySigned(value, { showPlus?: boolean })` in
[utils.ts](src/lib/utils.ts) ergänzen, das immer U+2212 verwendet, und die
String-Konkatenationen ersetzen.

### K3 — Fehlender Nullwert-Platzhalter inkonsistent 🟢

`"—"` (Em-Dash) ist der Standard und wird fast überall verwendet ✅ — außer:
`{r.costs > 0 ? … : "—"}` vs. `{p.customer?.name ?? "—"}` vs. leerer String in einigen
Zellen. Kein echtes Problem, aber `formatCurrency(null)` gibt bereits `"—"` zurück
([utils.ts:35](src/lib/utils.ts#L35)) — das wird an mehreren Stellen nochmal manuell geprüft.

---

## L. Status-Badges & Labels

### L1 — Roher Enum-Wert im UI 🔴 (Bug)

[devices/[id]/page.tsx:212](src/app/(app)/devices/[id]/page.tsx#L212):
```tsx
<Badge variant={projectStatusVariant(a.project.status)} className="text-[10px]">
  {a.project.status}          {/* ← zeigt "CONFIRMED" statt "Bestätigt" */}
</Badge>
```
Die Variante wird korrekt gemappt, das Label nicht.

**Zu tun:** `{projectStatusLabel(a.project.status)}`.

### L2 — Kein `labels.ts`-Mapping für Rechnungs- und Angebots-Status 🟡

Für Projekte gibt es `projectStatusLabel` / `projectStatusVariant` / `projectStatusRowClass` /
`projectStatusEmoji` in [labels.ts](src/lib/labels.ts) ✅. Für Rechnungen und Angebote wird
das Äquivalent **in jeder Tabelle neu gebaut**:

| Status-Logik | Ort |
|---|---|
| `invoiceStatus()` + Badge-Zuordnung (Bezahlt/Überfällig/Offen) | [invoices-table:70,322](src/app/(app)/finances/invoices-table.tsx#L70) |
| `quoteStatus()` + Badge-Zuordnung (Gültig/Angenommen/Abgelaufen/Ersetzt) | [quotes-table:59,272](src/app/(app)/finances/quotes-table.tsx#L59) |
| dieselbe Logik erneut | [finances-section](src/app/(app)/projects/[id]/finances-section.tsx#L1346) |
| `labelFor()` (Rechnung/Vorkasse/Mahnung) | [invoices-table:59](src/app/(app)/finances/invoices-table.tsx#L59) |

Wenn sich eine Statusfarbe ändert, muss man drei Dateien finden.

**Zu tun:** Nach [labels.ts](src/lib/labels.ts) verschieben:
`invoiceStatus()`, `invoiceStatusLabel()`, `invoiceStatusVariant()`, `invoiceKindLabel()`,
`quoteStatus()`, `quoteStatusLabel()`, `quoteStatusVariant()`.

### L3 — `statusChipClass` dupliziert die Badge-Varianten 🟢

[filter-controls.tsx:38](src/components/filters/filter-controls.tsx#L38) definiert eigene
Tönungen pro Status, die inhaltlich `projectStatusVariant` + `badgeVariants` entsprechen
(DRAFT→`bg-accent text-muted-foreground` ≈ `outline`, CONFIRMED→info ≈ `secondary`, …).

**Zu tun:** Chips über `badgeVariants({ variant: projectStatusVariant(s) })` einfärben statt
über eine zweite Map. Dann kann eine Statusfarbe nicht mehr auseinanderlaufen.

### L4 — Badge-artiger Toggle-Button ist kein Badge 🟢

Der Vorkasse/Rechnung-Umschalter in [invoices-table:277](src/app/(app)/finances/invoices-table.tsx#L277)
ist ein `<button>` mit `rounded-md border px-2 py-0.5 text-[10px] font-medium` — der Badge
daneben (bezahlter Zustand, Zeile 296) hat `rounded-[5px] … text-[11px] font-semibold`.
Gleiche Information, sichtbar anderer Chip.

Analog: [services-section:724](src/app/(app)/projects/[id]/services-section.tsx#L724)
(„Rechnung erhalten" als Toggle).

**Zu tun:** `<Badge asChild><button …/></Badge>` bzw. eine `ToggleBadge`-Komponente, die
`badgeVariants` reicht.

---

## M. Barrierefreiheit & Restposten 🟢

| # | Finding | Ort |
|---|---|---|
| a | Icon-Buttons ohne Label (siehe **F3**) | users/user-actions · locations-table · categories-tree · pack-units-section |
| b | Kalender-Navigation hat `title`, aber kein `aria-label` | [timeline:242,245](src/app/(app)/calendar/timeline.tsx#L242) |
| c | Chip-Buttons ohne Focus-Ring (siehe **A6h**) | filter-controls · group-table |
| d | `sr-only` „Close" auf Englisch (siehe **A6c**) | dialog.tsx |
| e | Rohes `<input type="checkbox">` ohne Label-Verknüpfung | [quotes-table:184](src/app/(app)/finances/quotes-table.tsx#L184) |
| f | Public-Seiten (`/public/devices`, `/public/pack-units`) nutzen `text-3xl font-bold` — die App-Detailseiten `text-[21px] font-extrabold`. Kein Theme-Toggle, keine Marke. | [public/devices/[id]:71](src/app/public/devices/[id]/page.tsx#L71) · [public/pack-units/[id]:47](src/app/public/pack-units/[id]/page.tsx#L47) |
| g | `signature`-Bild im Angebot auf `bg-white` hartkodiert (Dark Mode) | [angebot/[token]/page.tsx:179](src/app/angebot/[token]/page.tsx#L179) |
| h | Kalender-Legende und Timeline-Chips nutzen eigene Farbskala statt Status-Tokens | [timeline:448](src/app/(app)/calendar/timeline.tsx#L448) |

Zu **f**: Die drei öffentlichen Flächen (`/public/*`, `/angebot/[token]`, `/einsatz/[token]`,
`/scan/[token]`) haben je ein eigenes Layout-Gefühl. Sie sind bewusst schlichter als die App —
aber untereinander sollten sie gleich sein (gleiche Kopfzeile mit Marke, gleiche H1-Skala,
gleicher Container `mx-auto max-w-2xl px-4 py-8`). Aktuell teilen nur `/public/devices` und
`/public/pack-units` ein Muster.

---

## Vorgeschlagene Umsetzungsreihenfolge

Bewusst so sortiert, dass jeder Schritt die Arbeit der nächsten reduziert.

### Schritt 1 — Primitives härten (kein Call-Site-Churn, sofort sichtbar)
- **A2** `max-w`/`truncate` aus `Badge` entfernen
- **A3** `Badge size`-Variante
- **A4** `CardTitle` Default → `text-base`
- **A5** `Input`/`SelectTrigger` → 34 px
- **A6** b, c, d, f (Dialog-Footer-Gap, „Schließen", Checkbox-Border, thead-Hover)
- **F1** Button `iconSm`/`iconXs`-Varianten
- **F2** Button `ghostDestructive`-Variante
- **E1** `Table density`-Prop
- **H1/H2** `DialogContent size` + Scroll-Default
- **L1** Enum-Label-Bug fixen

### Schritt 2 — Gemeinsame Bausteine extrahieren
- `ListCard` (**B1**, **B2**, **D4**, **E2**)
- `DetailHeader` (**C1**)
- `StatTile` (**G4**, **C2**)
- `TableGroupRow` (**E3**)
- `TableEmpty` (**E4**)
- `RowActions` / `RowAction` (**F5**)
- `EmptyState` (**G3**)
- `toastError` / `toastBlocked` (**J1**)
- `.num` / `.num-strong` Utilities (**K1**)

### Schritt 3 — Call-Sites migrieren (bereichsweise, gut aufteilbar)
Reihenfolge nach Nutzungshäufigkeit:
1. **Material-Tabs** (devices/pack-units/cables/locations) — hier stecken die meisten Findings: D1, D2, E1, E2, E3, F1, F2, F4, K1
2. **Stammdaten** (Kunden, Personen, Positionen, Benutzer) — D1, D2, E1, E2, F1, F2
3. **Finanzen** (Rechnungen, Angebote, Zu-fakturieren, Forecast) — D3, G4, L2, L4
4. **Projekt-Tabs** — A1, G1, G2, I
5. **Settings** — A4, I3
6. **Öffentliche Seiten** — M f, g

### Schritt 4 — Verhaltensentscheidungen (brauchen deine Zustimmung, nicht nur Refactoring)
- **E5** Zeilen-Klick: welche Tabellen werden klickbar?
- **F4** Stift = Dialog statt Navigation in den Material-Tabs?
- **B5** `new`-Seiten oder Dialoge — was fliegt raus?
- **I3** Settings: Auto-Save oder explizites Speichern?
- **H3** `DialogDescription` überall oder nirgends?
- **K1.3** Datumsspalten in Mono?
- **A1.1** Neues `--subhire`-Token oder Zumietung über `info` abbilden?

### Schritt 5 — Absichern
- Grep-Check im CI gegen Palettenfarben (**A1.4**)
- ESLint-Regel oder Review-Checkliste gegen neue `[&_td]:`-Strings und `h-7 w-7`-Overrides
- Kurzes `docs/ui-conventions.md` mit den in Schritt 1–4 festgelegten Regeln
  (Control-Höhen, Dichte-Stufen, Badge-Größen, Dialog-Breiten, Farbregeln, Save-Muster)

---

## Anhang: Was bereits konsistent ist

Nicht anfassen — das sind die Muster, an denen sich der Rest orientieren soll:

- **Löschbestätigung.** Jede Löschung geht über `ConfirmDialog`, mit gleicher Formulierung
  („<strong>Name</strong> wird unwiderruflich gelöscht."), gleichem `confirmLabel`, gleichem
  `pending`-Handling. Vorbildlich.
- **Deaktivieren statt Löschen.** Wo Historie schützenswert ist (Personen, Positionen), wird
  konsistent deaktiviert und der Nutzer per `toast.info` informiert — inklusive vorab
  angepasstem `confirmLabel`.
- **Dialog-Footer.** „Abbrechen" (outline, links) + Submit mit `Loader2`-Spinner und
  `isEdit ? "Speichern" : "Anlegen"` — überall gleich.
- **Erfolgsmeldungen.** `"<Entität> angelegt/aktualisiert/gelöscht"` durchgängig.
- **`InfoHint`.** Ein Muster, eine Komponente, überall gleich platziert (rechts neben dem
  Card-Titel). Sehr gut.
- **Design-Tokens.** Das Token-Set in `globals.css` ist vollständig, dokumentiert (Hex-Werte
  als Kommentar) und deckt Light + Dark ab. Die Findings in A1 sind Umgehungen, keine Lücken.
- **Kommentar-Kultur.** Fachliche Begründungen im Code (z. B. warum `effectiveQuantity` nur
  einmal in `totalDemand` zählt, warum `stopPropagation` im Kunden-Dialog nötig ist) sind
  präzise und auf Deutsch. Bei den neuen Komponenten aus Schritt 2 beibehalten.
- **`serialize()`-Grenze.** Decimal→number passiert konsequent an der Server/Client-Grenze,
  nicht verstreut. Betrifft die UI indirekt: Zahlenformatierung muss sich nie mit
  Decimal-Objekten befassen.
