import { prisma } from "@/lib/prisma";
import { PDFDocument } from "pdf-lib";

/**
 * Lädt das Inhalts-PDF (z.B. von jsPDF) und legt das hochgeladene Briefpapier
 * als Hintergrund unter jede Seite — erste Seite separat, alle Folgeseiten mit
 * der zweiten Vorlage. Wenn kein Briefpapier hinterlegt ist, wird das
 * Original-PDF unverändert zurückgegeben.
 *
 * Vorgehen: Briefpapier-PDF wird als einzelnes Page-Embed eingebettet, die
 * Inhaltsseite wird auf die gleiche Größe gebracht und das Briefpapier-PDF wird
 * IN den Hintergrund jeder Seite gezeichnet, BEVOR die Inhalts-Elemente gemalt
 * werden — das ginge nur, wenn wir mit pdf-lib auch den Inhalt malen würden.
 * Da jsPDF den Inhalt bereits gemalt hat, drehen wir's um: wir nehmen den
 * jsPDF-Output und legen ihn ÜBER das Briefpapier. Da der jsPDF-Hintergrund
 * transparent ist (keine weißen Rechtecke), klappt das.
 */
export async function applyLetterhead(
  contentPdfBytes: ArrayBuffer | Uint8Array
): Promise<Uint8Array> {
  const [firstTpl, followingTpl] = await Promise.all([
    prisma.letterheadTemplate.findUnique({ where: { kind: "FIRST_PAGE" } }),
    prisma.letterheadTemplate.findUnique({ where: { kind: "FOLLOWING_PAGES" } }),
  ]);

  // Falls keine Vorlagen → Original zurückgeben
  if (!firstTpl && !followingTpl) {
    const u8 =
      contentPdfBytes instanceof Uint8Array
        ? contentPdfBytes
        : new Uint8Array(contentPdfBytes);
    return u8;
  }

  const contentDoc = await PDFDocument.load(contentPdfBytes);
  const outDoc = await PDFDocument.create();

  // Einbettungen der Briefpapier-Seiten vorbereiten
  let firstEmbed: Awaited<ReturnType<typeof outDoc.embedPdf>>[0] | null = null;
  let followingEmbed: Awaited<ReturnType<typeof outDoc.embedPdf>>[0] | null = null;
  if (firstTpl) {
    const embedded = await outDoc.embedPdf(new Uint8Array(firstTpl.data), [0]);
    firstEmbed = embedded[0] ?? null;
  }
  if (followingTpl) {
    const embedded = await outDoc.embedPdf(
      new Uint8Array(followingTpl.data),
      [0]
    );
    followingEmbed = embedded[0] ?? null;
  }

  const contentPages = contentDoc.getPages();
  for (let i = 0; i < contentPages.length; i++) {
    const src = contentPages[i];
    const { width, height } = src.getSize();
    const page = outDoc.addPage([width, height]);

    // Briefpapier zuerst als Hintergrund
    const tpl = i === 0 ? firstEmbed ?? followingEmbed : followingEmbed ?? firstEmbed;
    if (tpl) {
      page.drawPage(tpl, {
        x: 0,
        y: 0,
        width,
        height,
      });
    }

    // Inhalts-Seite drüberlegen
    const [embeddedContent] = await outDoc.embedPdf(
      await contentDoc.save({ useObjectStreams: false }),
      [i]
    );
    if (embeddedContent) {
      page.drawPage(embeddedContent, {
        x: 0,
        y: 0,
        width,
        height,
      });
    }
  }

  return await outDoc.save();
}
