import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { companyFooterFor } from "@/lib/company-footer";
import {
  buildSnapshotFromProject,
  isValidSnapshot,
  type DocumentSnapshot,
} from "@/lib/document-snapshot";
import { QUOTE_PDF_INCLUDE, renderSalesDocumentPdf } from "@/lib/quote-pdf";

const ORDER_CONFIRMATION_PDF_INCLUDE = {
  project: QUOTE_PDF_INCLUDE.project,
  quote: { select: { number: true, date: true } },
} satisfies Prisma.OrderConfirmationInclude;

export type OrderConfirmationWithProject = Prisma.OrderConfirmationGetPayload<{
  include: typeof ORDER_CONFIRMATION_PDF_INCLUDE;
}>;

export interface BuiltOrderConfirmationPdf {
  bytes: Uint8Array;
  filename: string;
  orderConfirmation: OrderConfirmationWithProject;
}

/**
 * Baut das PDF einer Auftragsbestätigung — Layout wie das Angebot, aber ohne
 * Gültigkeit und ohne Online-Annahme. Wird vom Download-Route-Handler und
 * beim E-Mail-Versand (Anhang) verwendet.
 */
export async function buildOrderConfirmationPdf(
  orderConfirmationId: string
): Promise<BuiltOrderConfirmationPdf | null> {
  const oc = await prisma.orderConfirmation.findUnique({
    where: { id: orderConfirmationId },
    include: ORDER_CONFIRMATION_PDF_INCLUDE,
  });
  if (!oc) return null;

  // Snapshot fehlt nur, wenn beim Anlegen etwas schiefging — dann aus den
  // Live-Daten rendern statt gar nicht.
  let snapshot: DocumentSnapshot;
  if (isValidSnapshot(oc.snapshot)) {
    snapshot = oc.snapshot;
  } else {
    const s = await getSettings();
    snapshot = buildSnapshotFromProject(oc.project, {
      vatPercent: s.vatPercent,
      companyName: s.companyName,
      companyStreet: s.companyStreet,
      companyZipCity: s.companyZipCity,
      dayFactorMap: s.dayFactorMap,
      quoteIntroText: s.orderConfirmationIntroText,
      quoteOutroText: s.orderConfirmationOutroText,
      pdfAccentColor: s.pdfAccentColor,
      companyFooter: companyFooterFor(s, "orderConfirmation"),
    });
  }

  const metaLines = [`Datum: ${oc.date.toLocaleDateString("de-DE")}`];
  if (oc.quote) {
    metaLines.push(
      `Bezug: Angebot ${oc.quote.number} vom ${oc.quote.date.toLocaleDateString("de-DE")}`
    );
  }

  const built = await renderSalesDocumentPdf({
    label: "Auftragsbestätigung",
    number: oc.number,
    metaLines,
    snapshot,
    notes: oc.notes,
    acceptance: null,
    footerNote: null,
  });
  return { ...built, orderConfirmation: oc };
}
