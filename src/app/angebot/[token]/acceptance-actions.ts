"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { sendQuoteAcceptedEmails } from "@/lib/email";

/**
 * Resultat-Typ der Annahme-Action. Diskriminierter Union, damit die UI
 * sauber zwischen Erfolg und den verschiedenen Fehlerursachen unterscheiden
 * kann.
 */
export type AcceptQuoteResult =
  | { ok: true; acceptedAt: string }
  | {
      ok: false;
      reason:
        | "UNKNOWN_TOKEN"
        | "ALREADY_ACCEPTED"
        | "EXPIRED"
        | "SUPERSEDED"
        | "INVALID_NAME"
        | "INVALID_EMAIL"
        | "INVALID_SIGNATURE"
        | "AGREEMENT_REQUIRED";
    };

/** Maximale erlaubte Größe der Signatur-PNG-DataURL (~200 KB). */
const MAX_SIGNATURE_BYTES = 200_000;

/** Bewusst lockere E-Mail-Prüfung — Tippfehler fängt eh nur der Bounce. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Nimmt ein Angebot per Public-Token an. Wird vom AcceptanceForm aufgerufen,
 * läuft serverseitig OHNE Auth — die Berechtigung kommt durch den Token.
 *
 * Verhalten beim Status-Update: nur wenn das verbundene Projekt aktuell im
 * Status DRAFT ist, wird es auf CONFIRMED gehoben. Andere Status (ACTIVE,
 * COMPLETED, CANCELLED) bleiben unangetastet — defensive Variante.
 */
export async function acceptQuote(input: {
  token: string;
  name: string;
  email: string;
  signaturePng: string;
  agreementChecked: boolean;
}): Promise<AcceptQuoteResult> {
  const token = (input.token ?? "").trim();
  const name = (input.name ?? "").trim();
  const email = (input.email ?? "").trim();
  const signaturePng = (input.signaturePng ?? "").trim();

  if (!input.agreementChecked) return { ok: false, reason: "AGREEMENT_REQUIRED" };
  if (!name || name.length < 2) return { ok: false, reason: "INVALID_NAME" };
  if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
    return { ok: false, reason: "INVALID_EMAIL" };
  }
  if (!signaturePng.startsWith("data:image/png;base64,")) {
    return { ok: false, reason: "INVALID_SIGNATURE" };
  }
  if (signaturePng.length > MAX_SIGNATURE_BYTES) {
    return { ok: false, reason: "INVALID_SIGNATURE" };
  }

  // Quote per Token nachschlagen
  const quote = await prisma.quote.findUnique({
    where: { acceptToken: token },
    select: {
      id: true,
      number: true,
      projectId: true,
      expiresAt: true,
      acceptedAt: true,
      supersededByQuoteId: true,
      project: {
        select: {
          id: true,
          status: true,
          name: true,
          maintainer: { select: { name: true, email: true } },
        },
      },
    },
  });
  if (!quote) return { ok: false, reason: "UNKNOWN_TOKEN" };
  if (quote.acceptedAt) return { ok: false, reason: "ALREADY_ACCEPTED" };
  if (quote.supersededByQuoteId) return { ok: false, reason: "SUPERSEDED" };

  // Ablauf erst NACH den anderen Checks prüfen — ein abgelaufenes Angebot
  // das schon angenommen wurde sollte weiter als "angenommen" geführt werden.
  const now = new Date();
  if (quote.expiresAt && quote.expiresAt < now) {
    return { ok: false, reason: "EXPIRED" };
  }

  // IP + User-Agent aus den Request-Headers extrahieren. Auf Vercel sitzt
  // der Server hinter einem Edge-Proxy, daher Forwarded-For prüfen.
  const h = await headers();
  const ip =
    (h.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    h.get("x-real-ip") ||
    null;
  const userAgent = h.get("user-agent") ?? null;

  // Update Quote + Project in einer Transaktion. Project-Status nur dann
  // ändern, wenn er aktuell DRAFT ist (siehe Doc-Comment oben).
  await prisma.$transaction(async (tx) => {
    await tx.quote.update({
      where: { id: quote.id },
      data: {
        acceptedAt: now,
        acceptedByName: name,
        acceptedByEmail: email,
        acceptedSignaturePng: signaturePng,
        acceptedIp: ip,
        acceptedUserAgent: userAgent,
      },
    });

    if (quote.project.status === "DRAFT") {
      await tx.project.update({
        where: { id: quote.project.id },
        data: { status: "CONFIRMED", confirmedAt: now },
      });
    }
  });

  // Bestätigungs-Mails an Kunde + Zuständigen. Die Annahme ist zu diesem
  // Zeitpunkt bereits committed — Mail-Fehler dürfen sie nicht scheitern
  // lassen, daher loggt sendQuoteAcceptedEmails intern statt zu werfen.
  await sendQuoteAcceptedEmails({
    quoteNumber: quote.number,
    projectId: quote.project.id,
    projectName: quote.project.name,
    token,
    acceptedAt: now,
    acceptedByName: name,
    customerEmail: email,
    maintainerEmail: quote.project.maintainer?.email ?? null,
    maintainerName: quote.project.maintainer?.name ?? null,
  });

  // Caches invalidieren
  revalidatePath(`/angebot/${token}`);
  revalidatePath(`/projects/${quote.projectId}`);
  revalidatePath("/finances/quotes");

  return { ok: true, acceptedAt: now.toISOString() };
}
