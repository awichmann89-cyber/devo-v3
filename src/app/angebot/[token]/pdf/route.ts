import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Public-PDF-Route für ein Angebot, erreichbar ohne Login via Token.
 *
 * Implementiert als dünner Wrapper: wir resolven den Token → Quote, holen
 * deren projectId + quoteId, und rewriten zur bereits existierenden
 * API-Route `/api/projects/[id]/quotes/[quoteId]/pdf?token=<TOKEN>`.
 *
 * Die existierende Route akzeptiert den Token als Auth-Alternative zur
 * Session (Token muss zu quote.acceptToken passen). So müssen wir die
 * ~700 Zeilen PDF-Rendering nicht duplizieren oder extrahieren.
 *
 * Wichtig: KEIN Supersession-Redirect hier. Wenn jemand die alte URL eines
 * ersetzten Angebots öffnet, soll er trotzdem das alte PDF bekommen — das
 * ist der historische Stand. Der Web-Page-Redirect übernimmt das Banner
 * "neue Version" auf der HTML-Seite.
 */
export async function GET(
  req: Request,
  props: { params: Promise<{ token: string }> },
) {
  const { token } = await props.params;
  const cleanToken = (token ?? "").trim();
  if (!cleanToken) {
    return new NextResponse("Token fehlt", { status: 400 });
  }

  const quote = await prisma.quote.findUnique({
    where: { acceptToken: cleanToken },
    select: { id: true, projectId: true },
  });
  if (!quote) {
    return new NextResponse("Angebot nicht gefunden", { status: 404 });
  }

  // Original-URL beibehalten (z.B. ?download=1 weiterleiten) und Token
  // anhängen, damit die existierende Route die Berechtigung anerkennt.
  const origUrl = new URL(req.url);
  const target = new URL(
    `/api/projects/${quote.projectId}/quotes/${quote.id}/pdf`,
    origUrl.origin,
  );
  // Bestehende Query-Params (download etc.) übernehmen
  origUrl.searchParams.forEach((v, k) => target.searchParams.set(k, v));
  // Token für die Public-Auth ergänzen
  target.searchParams.set("token", cleanToken);

  // 307 Temporary Redirect — Methode bleibt GET, Body wird nicht geändert.
  // Alternativ könnte man die andere Route per fetch + Stream proxien;
  // Redirect ist aber einfacher und für den Anwendungsfall ausreichend.
  return NextResponse.redirect(target.toString(), 307);
}
