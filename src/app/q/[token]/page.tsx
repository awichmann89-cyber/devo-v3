import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseQrPayload } from "@/lib/qr-code";

/**
 * Public Short-URL für QR-Codes — leitet auf die passende Detail-Seite weiter.
 *
 * Unterstützte Formate (siehe parseQrPayload):
 *   1) /q/<SHORTID>             — neues 8-Zeichen-Token-Schema (default)
 *   2) /q/(PU|DV)<cuid>         — interim Schema mit Kind-Prefix
 *   3) /public/(.../)<cuid>     — Legacy (wird hier nicht direkt geroutet,
 *                                 sondern beim Scanner-Lookup verwendet)
 */
export default async function QrShortLinkRedirect({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const parsed = parseQrPayload(token);

  // Neuer Pfad: shortId — wir wissen nicht, ob es eine Packeinheit oder ein
  // Gerät ist, also schauen wir in beiden Tabellen nach. shortId ist über
  // beide Tabellen hinweg statistisch eindeutig.
  if (parsed.shortId) {
    const [pu, dev] = await Promise.all([
      prisma.packUnit.findUnique({
        where: { shortId: parsed.shortId },
        select: { id: true },
      }),
      prisma.device.findUnique({
        where: { shortId: parsed.shortId },
        select: { id: true },
      }),
    ]);
    // WICHTIG: auf die /public-Seiten redirecten (ohne Login zugänglich),
    // damit Freelancer/Fremdfirmen die QR-Codes scannen können.
    if (pu) redirect(`/public/pack-units/${pu.id}`);
    if (dev) redirect(`/public/devices/${dev.id}`);
  }

  // Legacy: alte Kurzcode-URLs mit (PU|DV)<cuid> oder vergleichbar.
  if (parsed.legacyKind === "PU" && parsed.cuid) {
    redirect(`/public/pack-units/${parsed.cuid}`);
  }
  if (parsed.legacyKind === "DV" && parsed.cuid) {
    redirect(`/public/devices/${parsed.cuid}`);
  }

  // Nichts erkannt — zurück zur Startseite mit Query-Hinweis.
  redirect("/?qr=unknown");
}
