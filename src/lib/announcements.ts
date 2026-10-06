/**
 * Feature-Ankündigungen („Was ist neu"). Jeder Eintrag erscheint jedem Nutzer
 * genau einmal als Dialog beim nächsten Seitenaufruf nach dem Deploy — gemerkt
 * über User.seenAnnouncementId.
 *
 * Neues Feature ankündigen: Eintrag OBEN einfügen. Die `id` muss mit dem Datum
 * beginnen (YYYY-MM-DD-…), weil die Reihenfolge per Stringvergleich bestimmt
 * wird. Mehrere am selben Tag: Buchstabe ans Datum hängen (2026-09-30b-…),
 * NICHT an den Rest der Id. Kurz halten — ein Satz Einleitung, höchstens drei
 * Schritte.
 */
export interface Announcement {
  id: string;
  title: string;
  intro: string;
  steps: string[];
}

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: "2026-10-06-festpreis",
    title: "Festpreis im Finanzen-Tab",
    intro:
      "Du kannst den Gesamtpreis eines Projekts jetzt festsetzen. Spätere Änderungen an Material oder Personal & Transport verändern den Preis dann nicht mehr.",
    steps: [
      "Im Projekt unter „Finanzen“ rechts neben „Übersicht“ den Haken bei „Preis festsetzen“ setzen – das aktuelle Gesamt netto wird eingefroren.",
      "Kommen Positionen dazu, gleicht der projektweite Rabatt das automatisch aus. Fällt die Summe unter den Festpreis, bleibt der Rabatt bei 0 % und der Preis sinkt mit.",
      "Haken wieder entfernen hebt den Festpreis auf – der zuletzt berechnete Rabatt bleibt als normaler Wert stehen.",
    ],
  },
  {
    id: "2026-10-05b-besetzung",
    title: "Besetzung im Tab „Personal & Transport“",
    intro:
      "Wer für eine Position eingeplant ist, siehst du jetzt in einer eigenen Card „Besetzung“ unter der Positionsliste – wie die Belegung im Material-Tab.",
    steps: [
      "Im Projekt unter „Personal & Transport“ eine Position anklicken – darunter erscheinen die eingeplanten Personen bzw. Fahrzeuge mit Zeiten, Sätzen und Konflikten.",
      "Über „Person einplanen“ bzw. „Fahrzeug einplanen“ in der Card direkt nachbesetzen; Bearbeiten, Entfernen und „Rechnung erhalten“ funktionieren wie bisher.",
      "In der Positionsliste stehen die eingeplanten Namen klein unter jeder Position, „Unbesetzt“ und „Ohne Fahrzeug“ bleiben als Hinweis.",
    ],
  },
  {
    id: "2026-10-05-belegungszeitstrahl",
    title: "Belegungszeitstrahl im Material-Tab",
    intro:
      "Im Material-Tab eines Projekts siehst du jetzt auf einen Blick, welche anderen Projekte ein gebuchtes Gerät oder Kabel im selben Zeitraum belegen und wie viel noch frei ist.",
    steps: [
      "Im Projekt unter „Material“ eine gebuchte Geräte- oder Kabelzeile anklicken – der Zeitstrahl erscheint in der Card „Belegung“ darunter.",
      "Die Zeile „Frei“ zeigt pro Tag den freien Bestand: grün = frei, gelb = ausgebucht oder nur durch Entwürfe überbucht, rot = fest überbucht.",
      "Darunter steht je Projekt ein Balken mit der gebuchten Stückzahl; ein Klick auf den Projektnamen öffnet das Projekt.",
    ],
  },
  {
    id: "2026-09-30b-auftragsbestaetigung",
    title: "Auftragsbestätigungen",
    intro:
      "Im Finanzen-Tab eines Projekts kannst du jetzt neben Angeboten und Rechnungen auch Auftragsbestätigungen erstellen.",
    steps: [
      "Im Projekt unter „Finanzen“ auf „Auftragsbestätigung erstellen“ klicken und das Angebot wählen, auf das sie sich bezieht.",
      "Danach herunterladen oder direkt per E-Mail an den Kunden senden.",
      "Nummernformat, PDF-Texte und E-Mail-Vorlage findest du in den Einstellungen unter „Auftragsbestätigungen“ bzw. „E-Mail“.",
    ],
  },
  {
    id: "2026-09-30-zweite-namenszeile",
    title: "Zweite Namenszeile für Kunden",
    intro:
      "Unter dem Kundennamen kann jetzt eine zweite Zeile stehen, z.B. eine Abteilung oder „c/o …“ — auf Angebot, Rechnung und Lieferschein.",
    steps: [
      "Im Kunden-Dialog unter „Zweite Namenszeile (Auswahl)“ die möglichen Zeilen hinterlegen.",
      "Im Projekt unter dem Kunden die passende Zeile im Dropdown wählen — oder mit „+ Neue Zeile…“ direkt eine anlegen.",
      "Die Zeile gilt für alle neuen Dokumente des Projekts. Bereits erstellte Angebote und Rechnungen bleiben unverändert.",
    ],
  },
];

/**
 * Ankündigungen, die der Nutzer noch nicht gesehen hat (neueste zuerst).
 * Ohne gespeicherte Id nur die neueste — ein neuer Nutzer soll nicht die
 * komplette Historie durchklicken.
 */
export function unseenAnnouncements(seenId: string | null): Announcement[] {
  if (!seenId) return ANNOUNCEMENTS.slice(0, 1);
  return ANNOUNCEMENTS.filter((a) => a.id > seenId);
}
