/**
 * Baut die DESCRIPTION für die Kalender-Feeds (planning.ics / billing.ics).
 *
 * iOS/Apple Kalender rendert kein Markdown und kein HTML — die Beschreibung
 * muss reiner Text mit Zeilenumbrüchen sein. Notizen (Markdown) werden deshalb
 * zu Klartext konvertiert; Geräte erscheinen als kompakte Stückzahl-Liste.
 * Kabel und Packeinheiten bleiben bewusst außen vor.
 */

export interface CalendarNote {
  title: string;
  content: string;
}

export interface DeviceCount {
  name: string;
  quantity: number;
}

/**
 * Markdown → Klartext: Formatierungs-Marker entfernen, Inhalt behalten.
 * Listen werden zu „•", Links zu „Text (URL)" (URLs sind auf iOS antippbar).
 */
export function markdownToPlainText(md: string): string {
  let text = md.replace(/\r\n/g, "\n");
  // Code-Fence-Marker (```lang) entfernen, Inhalt behalten
  text = text.replace(/^```.*$/gm, "");
  // Überschriften: #-Marker entfernen
  text = text.replace(/^#{1,6}\s+/gm, "");
  // Bilder → Alt-Text
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Links → „Text (URL)"; identische Angaben nicht doppeln
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, url: string) =>
    label.trim() === url.trim() ? url : `${label} (${url})`
  );
  // Fett / kursiv / durchgestrichen
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
  text = text.replace(/(\*|_)(.*?)\1/g, "$2");
  text = text.replace(/~~(.*?)~~/g, "$1");
  // Inline-Code
  text = text.replace(/`([^`]+)`/g, "$1");
  // Blockquotes
  text = text.replace(/^>\s?/gm, "");
  // Horizontale Linien
  text = text.replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, "———");
  // Listen-Marker vereinheitlichen
  text = text.replace(/^(\s*)[-*+]\s+/gm, "$1• ");
  // Mehrfache Leerzeilen eindampfen
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/** Geräte-Buchungen zu einer Stückzahl-Übersicht aggregieren (gruppenübergreifend). */
export function aggregateDeviceCounts(
  assignments: { quantity: number; device: { name: string } }[]
): DeviceCount[] {
  const counts = new Map<string, number>();
  for (const a of assignments) {
    counts.set(a.device.name, (counts.get(a.device.name) ?? 0) + a.quantity);
  }
  return [...counts.entries()]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/**
 * DESCRIPTION für den persönlichen Einsatz-Feed (person.ics): Kunde,
 * gebuchte Position, geplantes Zeitfenster und Einsatz-Notiz als Klartext.
 */
export function buildAssignmentCalendarDescription(opts: {
  customerName?: string | null;
  serviceName: string;
  timeLabel: string;
  notes?: string | null;
}): string | undefined {
  const blocks: string[] = [];

  if (opts.customerName) {
    blocks.push(opts.customerName);
  }
  blocks.push(`👷 ${opts.serviceName}`);
  blocks.push(`🕒 ${opts.timeLabel}`);
  if (opts.notes) {
    blocks.push(`📝 ${opts.notes}`);
  }

  return blocks.length > 0 ? blocks.join("\n\n") : undefined;
}

export function buildProjectCalendarDescription(opts: {
  customerName?: string | null;
  devices: DeviceCount[];
  notes: CalendarNote[];
}): string | undefined {
  const blocks: string[] = [];

  if (opts.customerName) {
    blocks.push(opts.customerName);
  }

  if (opts.devices.length > 0) {
    blocks.push(
      ["📦 Geräte", ...opts.devices.map((d) => `${d.quantity}× ${d.name}`)].join("\n")
    );
  }

  for (const note of opts.notes) {
    const content = markdownToPlainText(note.content);
    blocks.push(content ? `📝 ${note.title}\n${content}` : `📝 ${note.title}`);
  }

  return blocks.length > 0 ? blocks.join("\n\n") : undefined;
}
