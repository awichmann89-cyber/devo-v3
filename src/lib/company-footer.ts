/**
 * Firmendaten-Fußzeile für Angebots-, Auftragsbestätigungs- und
 * Rechnungs-PDFs (Bankverbindung, Steuernummer, Kontakt …).
 *
 * Ob die Fußzeile gedruckt wird, ist pro Dokumentart in den Einstellungen
 * schaltbar — viele Briefpapiere tragen diese Angaben bereits selbst, dann
 * bleibt der Schalter aus und das Briefpapier wird nicht überdruckt.
 *
 * Die Spalten werden beim Anlegen eines Dokuments in den Snapshot geschrieben,
 * damit spätere Änderungen an den Firmendaten bereits ausgegebene Dokumente
 * nicht verändern.
 *
 * Bewusst ohne Prisma-Import, damit auch die Einstellungsseite (Client) die
 * Vorschau mit derselben Logik bauen kann.
 */
import type { jsPDF } from "jspdf";
import type { SettingKey } from "@/lib/settings";

export type CompanyFooterDocument = "invoice" | "quote" | "orderConfirmation";

/** Settings-Schlüssel des Fußzeilen-Schalters pro Dokumentart. */
export const COMPANY_FOOTER_TOGGLE_KEY = {
  invoice: "invoiceShowCompanyFooter",
  quote: "quoteShowCompanyFooter",
  orderConfirmation: "orderConfirmationShowCompanyFooter",
} as const satisfies Record<CompanyFooterDocument, SettingKey>;

export type CompanyFooterFields = Pick<
  Record<SettingKey, string>,
  | "companyName"
  | "companyStreet"
  | "companyZipCity"
  | "companyPhone"
  | "companyEmail"
  | "companyWebsite"
  | "companyManagement"
  | "companyRegister"
  | "companyTaxNumber"
  | "companyVatId"
  | "bankAccountHolder"
  | "bankName"
  | "bankIban"
  | "bankBic"
>;

/** IBAN in Vierergruppen, z.B. „DE12 3456 7890 1234 5678 90". */
export function formatIban(iban: string): string {
  return iban
    .replace(/\s+/g, "")
    .toUpperCase()
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

/**
 * Baut die Spalten der Fußzeile: Anschrift · Kontakt · Bankverbindung ·
 * Steuer/Register. Leere Angaben fallen weg, leere Spalten ebenso.
 */
export function buildCompanyFooterColumns(s: CompanyFooterFields): string[][] {
  const t = (v: string | undefined) => (v ?? "").trim();
  const line = (label: string, v: string | undefined) =>
    t(v) ? `${label} ${t(v)}` : "";

  const columns = [
    [t(s.companyName), t(s.companyStreet), t(s.companyZipCity)],
    [
      line("Tel.:", s.companyPhone),
      line("E-Mail:", s.companyEmail),
      t(s.companyWebsite),
    ],
    [
      t(s.bankName),
      t(s.bankIban) ? `IBAN: ${formatIban(s.bankIban)}` : "",
      line("BIC:", s.bankBic?.toUpperCase()),
      line("Kontoinhaber:", s.bankAccountHolder),
    ],
    [
      t(s.companyManagement),
      t(s.companyRegister),
      line("Steuernr.:", s.companyTaxNumber),
      line("USt-IdNr.:", s.companyVatId),
    ],
  ];
  return columns
    .map((col) => col.filter(Boolean))
    .filter((col) => col.length > 0);
}

/**
 * Fußzeilen-Spalten für ein neues Dokument — `null`, wenn der Schalter für
 * diese Dokumentart aus ist.
 */
export function companyFooterFor(
  settings: CompanyFooterFields & Partial<Record<SettingKey, string>>,
  document: CompanyFooterDocument
): string[][] | null {
  if (settings[COMPANY_FOOTER_TOGGLE_KEY[document]] !== "1") return null;
  const columns = buildCompanyFooterColumns(settings);
  return columns.length > 0 ? columns : null;
}

/**
 * Stempelt die Fußzeile auf jede Seite des Dokuments — unterhalb der
 * Seitenzahl (y = 258 mm), bündig zum unteren Rand. Aufrufen, nachdem alle
 * Seiten gerendert sind.
 */
export function drawCompanyFooter(
  doc: jsPDF,
  columns: string[][] | null | undefined
): void {
  if (!columns || columns.length === 0) return;

  const LEFT_X = 14;
  const RIGHT_X = 196; // A4 = 210 mm, 14 mm Rand rechts
  const BOTTOM_Y = 287;
  const LINE_H = 3.2;
  const GAP = 4;

  doc.setFontSize(7);
  doc.setFont(undefined as unknown as string, "normal");
  const colWidth = (RIGHT_X - LEFT_X - GAP * (columns.length - 1)) / columns.length;
  const wrapped = columns.map((col) =>
    col.flatMap((l) => doc.splitTextToSize(l, colWidth) as string[])
  );
  const maxLines = Math.max(...wrapped.map((c) => c.length));
  const topY = BOTTOM_Y - (maxLines - 1) * LINE_H;

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(180);
    doc.setLineWidth(0.2);
    doc.line(LEFT_X, topY - 4, RIGHT_X, topY - 4);
    doc.setTextColor(90);
    wrapped.forEach((col, idx) => {
      const x = LEFT_X + idx * (colWidth + GAP);
      col.forEach((l, j) => doc.text(l, x, topY + j * LINE_H));
    });
  }
  doc.setTextColor(0);
}
