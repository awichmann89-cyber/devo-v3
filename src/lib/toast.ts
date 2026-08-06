import { toast } from "sonner";

/**
 * Einheitliche Fehler-Toasts.
 *
 * Vorher gab es sieben verschiedene Titel ("Fehler", "Löschen fehlgeschlagen",
 * "Löschen nicht möglich", nur die rohe Message, …) und zwei Aufrufformen.
 * Regel: Der Titel nennt die Aktion, die technische Meldung wandert in die
 * Description.
 */

function message(e: unknown): string | undefined {
  if (e instanceof Error) return e.message || undefined;
  if (typeof e === "string" && e.trim()) return e;
  return undefined;
}

/**
 * Technischer/unerwarteter Fehler.
 *
 * @param action Aktion im Infinitiv ohne Artikel: "Löschen", "Speichern",
 *               "Hochladen", "Anlegen".
 */
export function toastError(e: unknown, action: string): void {
  toast.error(`${action} fehlgeschlagen`, { description: message(e) });
}

/**
 * Fachliche Sperre — der Vorgang ist nicht kaputt, sondern nicht erlaubt
 * (z.B. Kunde hat noch Projekte). Bewusst eigener Titel, damit der Nutzer den
 * Unterschied zu einem echten Fehler sieht.
 */
export function toastBlocked(e: unknown, action: string): void {
  toast.error(`${action} nicht möglich`, { description: message(e) });
}

/**
 * `NEXT_REDIRECT` ist kein Fehler, sondern das Signal einer Server-Action, die
 * navigiert — muss durchgereicht werden, sonst bleibt die Navigation aus.
 */
export function isRedirectError(e: unknown): boolean {
  return e instanceof Error && e.message === "NEXT_REDIRECT";
}
