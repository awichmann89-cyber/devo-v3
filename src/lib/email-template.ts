/**
 * Ersetzt Platzhalter der Form {{key}} in einer E-Mail-Vorlage. Wird beim
 * Vorbefüllen des Sende-Dialogs (Angebot/Rechnung) auf die in den
 * Einstellungen hinterlegten Texte angewandt — die Vorlage selbst bleibt
 * unersetzt gespeichert.
 */
export function fillTemplate(
  text: string,
  vars: Record<string, string>
): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
    key in vars ? vars[key] : match
  );
}
