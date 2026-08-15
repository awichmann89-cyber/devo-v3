import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { buildQuotePdf } from "@/lib/quote-pdf";

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string; quoteId: string }> }
) {
  const session = await auth();
  const url = new URL(req.url);
  // ?download=1 forciert den Download statt der Inline-Anzeige.
  const download = url.searchParams.get("download") === "1";
  // ?token=XXX erlaubt den Public-Zugriff auf das Quote-PDF (für die
  // /angebot/<token>/pdf-Route). Der Token wird unten gegen den
  // gespeicherten quote.acceptToken validiert; passt er nicht, geben wir
  // 403 zurück. Ohne Token UND ohne Session → 401.
  const publicToken = url.searchParams.get("token");
  if (!session && !publicToken) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id, quoteId } = await props.params;
  const authCheck = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: { projectId: true, acceptToken: true },
  });
  if (!authCheck || authCheck.projectId !== id) {
    return new NextResponse("Not found", { status: 404 });
  }
  // Token-Validierung für den Public-Zugriff: wenn KEINE Session und ein
  // Token vorhanden ist, muss der Token zum Quote passen. Sonst 403.
  if (!session && publicToken && authCheck.acceptToken !== publicToken) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const built = await buildQuotePdf(quoteId, new URL(req.url).origin);
  if (!built) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(built.bytes as BodyInit, {
    headers: {
      // iOS Safari ignoriert Content-Disposition: attachment bei application/pdf
      // und öffnet das Dokument trotzdem inline im Viewer. Für Downloads senden
      // wir deshalb application/octet-stream — dann landet die Datei sicher im
      // Download-Ordner statt im PDF-Viewer.
      "Content-Type": download ? "application/octet-stream" : "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${built.filename}"; filename*=UTF-8''${encodeURIComponent(built.filename)}`,
    },
  });
}
