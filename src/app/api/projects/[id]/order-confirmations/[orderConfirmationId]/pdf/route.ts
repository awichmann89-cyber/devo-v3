import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { buildOrderConfirmationPdf } from "@/lib/order-confirmation-pdf";

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string; orderConfirmationId: string }> }
) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  // ?download=1 forciert den Download statt der Inline-Anzeige.
  const download = url.searchParams.get("download") === "1";

  const { id, orderConfirmationId } = await props.params;
  const check = await prisma.orderConfirmation.findUnique({
    where: { id: orderConfirmationId },
    select: { projectId: true },
  });
  if (!check || check.projectId !== id) {
    return new NextResponse("Not found", { status: 404 });
  }

  const built = await buildOrderConfirmationPdf(orderConfirmationId);
  if (!built) return new NextResponse("Not found", { status: 404 });

  // „Auftragsbestätigung" enthält ein ä — HTTP-Header sind Latin-1, darum im
  // einfachen filename= eine ASCII-Umschrift; filename* trägt den Originalnamen.
  const asciiName = built.filename
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
    .replace(/[^\x20-\x7e]/g, "_");

  return new NextResponse(built.bytes as BodyInit, {
    headers: {
      // application/octet-stream beim Download — siehe Quote-Route (iOS Safari).
      "Content-Type": download ? "application/octet-stream" : "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(built.filename)}`,
    },
  });
}
