/**
 * Feature-Ankündigungen („Was ist neu"). Jeder Eintrag erscheint jedem Nutzer
 * genau einmal als Dialog beim nächsten Seitenaufruf nach dem Deploy — gemerkt
 * über User.seenAnnouncementId.
 *
 * Neues Feature ankündigen: Eintrag OBEN einfügen. Die `id` muss mit dem Datum
 * beginnen (YYYY-MM-DD-…), weil die Reihenfolge per Stringvergleich bestimmt
 * wird. Kurz halten — ein Satz Einleitung, höchstens drei Schritte.
 */
export interface Announcement {
  id: string;
  title: string;
  intro: string;
  steps: string[];
}

export const ANNOUNCEMENTS: Announcement[] = [
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
