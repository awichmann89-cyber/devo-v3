import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { buildInvoicePdf } from "@/lib/invoice-pdf";

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string; invoiceId: string }> }
) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id, invoiceId } = await props.params;
  // ?download=1 forciert den Download — wird beim frischen Erstellen genutzt,
  // damit das PDF direkt im Download-Ordner landet statt im Browser-Viewer.
  const download = new URL(req.url).searchParams.get("download") === "1";

  const authCheck = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { projectId: true },
  });
  if (!authCheck || authCheck.projectId !== id) {
    return new NextResponse("Not found", { status: 404 });
  }

  const built = await buildInvoicePdf(invoiceId);
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
