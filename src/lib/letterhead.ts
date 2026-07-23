import { prisma } from "@/lib/prisma";
import {
  PDFDocument,
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFString,
  type PDFPage,
} from "pdf-lib";

/**
 * Kopiert die URI-Link-Annotationen (klickbare Bereiche, z.B. der „Angebot
 * online annehmen"-Button) einer Quell-Seite auf die Ziel-Seite.
 *
 * Nötig, weil drawPage() die Inhaltsseite nur als Grafik (XObject) einbettet:
 * Annotationen hängen am Seiten-Objekt, nicht im Content-Stream, und gehen
 * beim Merge sonst verloren — der Button im PDF wäre nicht mehr klickbar.
 * Ziel- und Quellseite sind gleich groß und der Inhalt wird 1:1 bei (0,0)
 * gezeichnet, daher können die Rect-Koordinaten unverändert übernommen werden.
 */
function copyUriLinkAnnotations(
  srcPage: PDFPage,
  dstPage: PDFPage,
  outDoc: PDFDocument
): void {
  const annots = srcPage.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (!annots) return;

  const copied: PDFRef[] = [];
  for (let i = 0; i < annots.size(); i++) {
    let annot: PDFDict;
    try {
      annot = annots.lookup(i, PDFDict);
    } catch {
      continue;
    }
    if (annot.lookupMaybe(PDFName.of("Subtype"), PDFName) !== PDFName.of("Link")) continue;
    const action = annot.lookupMaybe(PDFName.of("A"), PDFDict);
    const rect = annot.lookupMaybe(PDFName.of("Rect"), PDFArray);
    if (!action || !rect || rect.size() !== 4) continue;
    if (action.lookupMaybe(PDFName.of("S"), PDFName) !== PDFName.of("URI")) continue;
    const uri =
      action.lookupMaybe(PDFName.of("URI"), PDFString) ??
      action.lookupMaybe(PDFName.of("URI"), PDFHexString);
    if (!uri) continue;

    let rectNums: number[];
    try {
      rectNums = [0, 1, 2, 3].map((j) => rect.lookup(j, PDFNumber).asNumber());
    } catch {
      continue;
    }

    const linkDict = outDoc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: rectNums,
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(uri.decodeText()) },
    });
    copied.push(outDoc.context.register(linkDict));
  }

  if (copied.length === 0) return;
  dstPage.node.set(PDFName.of("Annots"), outDoc.context.obj(copied));
}

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

    // Klickbare Links (z.B. Online-Annehmen-Button) von der Original-Seite
    // übernehmen — drawPage() allein verliert sie.
    copyUriLinkAnnotations(src, page, outDoc);
  }

  return await outDoc.save();
}
