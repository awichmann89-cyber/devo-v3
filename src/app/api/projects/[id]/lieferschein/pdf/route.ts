import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildDeliveryNotePdf } from "@/lib/delivery-note-pdf";

/**
 * Lieferschein zu einem Projekt als PDF.
 *
 * Die Route liegt bewusst unter `.../lieferschein/pdf/` statt (wie die
 * Packliste) unter `.../lieferschein.pdf/`: nur ein Pfadsegment `pdf` wird vom
 * `outputFileTracingIncludes`-Glob in next.config.ts erfasst, das die
 * Geist-TTFs ins Vercel-Server-Bundle zieht. Ohne das würde das PDF in der
 * Produktion still auf Helvetica zurückfallen.
 */
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  // ?download=1 forciert den Download statt der Inline-Anzeige.
  const download = new URL(req.url).searchParams.get("download") === "1";
  const { id } = await props.params;

  const built = await buildDeliveryNotePdf(id);
  if (!built) return new NextResponse("Not found", { status: 404 });

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
