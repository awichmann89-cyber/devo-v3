import { Resend } from "resend";
import { getSetting } from "@/lib/settings";

/**
 * E-Mail-Versand via Resend.
 *
 * Konfiguration über Env:
 *   * RESEND_API_KEY — ohne Key wird der Versand übersprungen (nur Log),
 *     damit lokale Umgebungen ohne Resend-Account weiter funktionieren.
 *   * EMAIL_FROM — Absender-Adresse; die Domain muss in Resend verifiziert
 *     sein. Default: apps@alw-mediaworks.de
 */

const FROM_ADDRESS = process.env.EMAIL_FROM || "apps@alw-mediaworks.de";

/** Basis-URL der App für Links in Mails — auf Vercel via AUTH_URL gesetzt. */
function getBaseUrl(): string {
  return (process.env.AUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/** Datum + Uhrzeit deutsch formatiert, explizit Europe/Berlin (Server läuft UTC). */
function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(d);
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Minimales, mail-client-taugliches HTML-Gerüst (Inline-Styles, eine Spalte). */
function renderLayout(bodyHtml: string, footerText: string): string {
  return `<div style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:8px;padding:32px;color:#18181b;font-size:14px;line-height:1.6;">
    ${bodyHtml}
  </div>
  <p style="max-width:560px;margin:16px auto 0;color:#71717a;font-size:12px;line-height:1.5;text-align:center;">
    ${escapeHtml(footerText)}<br/>Diese E-Mail wurde automatisch versendet.
  </p>
</div>`;
}

export interface QuoteAcceptedEmailParams {
  quoteNumber: string;
  projectId: string;
  projectName: string;
  /** Public-Token des Angebots für den Link auf /angebot/<token>. */
  token: string;
  acceptedAt: Date;
  acceptedByName: string;
  /** Vom Kunden im Formular eingetragene Adresse. */
  customerEmail: string;
  /** Zuständiger des Projekts (Project.maintainer) — kann fehlen. */
  maintainerEmail: string | null;
  maintainerName: string | null;
}

/**
 * Verschickt nach erfolgreicher Angebots-Annahme zwei Bestätigungs-Mails:
 * eine an den Kunden (Adresse aus dem Annahme-Formular) und eine an den
 * Zuständigen des Projekts. Fehler werden geloggt, aber nie geworfen —
 * die Annahme selbst ist zu diesem Zeitpunkt bereits gespeichert und darf
 * durch Mail-Probleme nicht als fehlgeschlagen erscheinen.
 */
export async function sendQuoteAcceptedEmails(
  params: QuoteAcceptedEmailParams,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      `[email] RESEND_API_KEY nicht gesetzt — Bestätigungs-Mails für Angebot ${params.quoteNumber} übersprungen.`,
    );
    return;
  }
  const resend = new Resend(apiKey);

  const companyName = (await getSetting("companyName")).trim();
  // Anzeigename mit Pipe/Umlauten → in Anführungszeichen (RFC 5322).
  const fromName = companyName
    ? `Auftragsbestätigung | ${companyName}`
    : "Auftragsbestätigung";
  const from = `"${fromName.replaceAll('"', "'")}" <${FROM_ADDRESS}>`;
  const footer = companyName || FROM_ADDRESS;

  const baseUrl = getBaseUrl();
  const quoteUrl = `${baseUrl}/angebot/${params.token}`;
  const projectUrl = `${baseUrl}/projects/${params.projectId}`;
  const when = formatDateTime(params.acceptedAt);

  const num = escapeHtml(params.quoteNumber);
  const project = escapeHtml(params.projectName);
  const name = escapeHtml(params.acceptedByName);

  // ===== Mail an den Kunden =====
  const customerHtml = renderLayout(
    `<h1 style="margin:0 0 16px;font-size:18px;">Angebot ${num} angenommen</h1>
     <p style="margin:0 0 12px;">Guten Tag ${name},</p>
     <p style="margin:0 0 12px;">
       vielen Dank! Sie haben das Angebot <strong>${num}</strong>
       zum Projekt <strong>${project}</strong> am ${escapeHtml(when)} Uhr
       verbindlich angenommen.
     </p>
     <p style="margin:0 0 20px;">
       Das Angebot können Sie jederzeit online einsehen und dort auch als
       PDF herunterladen:
     </p>
     <p style="margin:0 0 20px;">
       <a href="${quoteUrl}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold;">Angebot ansehen</a>
     </p>
     <p style="margin:0;">Mit freundlichen Grüßen${companyName ? `<br/>${escapeHtml(companyName)}` : ""}</p>`,
    footer,
  );
  const customerText = [
    `Guten Tag ${params.acceptedByName},`,
    ``,
    `vielen Dank! Sie haben das Angebot ${params.quoteNumber} zum Projekt "${params.projectName}" am ${when} Uhr verbindlich angenommen.`,
    ``,
    `Angebot ansehen und als PDF herunterladen: ${quoteUrl}`,
    ``,
    `Mit freundlichen Grüßen`,
    companyName || FROM_ADDRESS,
  ].join("\n");

  // ===== Mail an den Zuständigen =====
  const maintainerGreeting = params.maintainerName
    ? `Hallo ${params.maintainerName},`
    : "Hallo,";
  const maintainerHtml = renderLayout(
    `<h1 style="margin:0 0 16px;font-size:18px;">Angebot ${num} wurde angenommen</h1>
     <p style="margin:0 0 12px;">${escapeHtml(maintainerGreeting)}</p>
     <p style="margin:0 0 12px;">
       Das Angebot <strong>${num}</strong> zum Projekt
       <strong>${project}</strong> wurde soeben online angenommen.
     </p>
     <table style="margin:0 0 20px;border-collapse:collapse;font-size:14px;">
       <tr><td style="padding:2px 12px 2px 0;color:#71717a;">Angenommen durch</td><td style="padding:2px 0;">${name}</td></tr>
       <tr><td style="padding:2px 12px 2px 0;color:#71717a;">E-Mail</td><td style="padding:2px 0;">${escapeHtml(params.customerEmail)}</td></tr>
       <tr><td style="padding:2px 12px 2px 0;color:#71717a;">Zeitpunkt</td><td style="padding:2px 0;">${escapeHtml(when)} Uhr</td></tr>
     </table>
     <p style="margin:0 0 20px;">
       <a href="${projectUrl}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold;">Projekt öffnen</a>
     </p>
     <p style="margin:0;color:#71717a;font-size:12px;">Angenommenes Angebot: <a href="${quoteUrl}" style="color:#71717a;">${quoteUrl}</a></p>`,
    footer,
  );
  const maintainerText = [
    maintainerGreeting,
    ``,
    `das Angebot ${params.quoteNumber} zum Projekt "${params.projectName}" wurde soeben online angenommen.`,
    ``,
    `Angenommen durch: ${params.acceptedByName}`,
    `E-Mail: ${params.customerEmail}`,
    `Zeitpunkt: ${when} Uhr`,
    ``,
    `Projekt öffnen: ${projectUrl}`,
    `Angenommenes Angebot: ${quoteUrl}`,
  ].join("\n");

  const sends: Promise<{ to: string; error: unknown }>[] = [
    resend.emails
      .send({
        from,
        to: params.customerEmail,
        subject: `Bestätigung: Angebot ${params.quoteNumber} angenommen`,
        html: customerHtml,
        text: customerText,
      })
      .then((r) => ({ to: params.customerEmail, error: r.error })),
  ];

  if (params.maintainerEmail) {
    sends.push(
      resend.emails
        .send({
          from,
          to: params.maintainerEmail,
          subject: `Angebot ${params.quoteNumber} wurde angenommen — ${params.projectName}`,
          html: maintainerHtml,
          text: maintainerText,
        })
        .then((r) => ({ to: params.maintainerEmail!, error: r.error })),
    );
  } else {
    console.warn(
      `[email] Projekt "${params.projectName}" hat keinen Zuständigen mit E-Mail — nur Kunden-Mail für Angebot ${params.quoteNumber} versendet.`,
    );
  }

  const results = await Promise.allSettled(sends);
  for (const r of results) {
    if (r.status === "rejected") {
      console.error(`[email] Versand fehlgeschlagen:`, r.reason);
    } else if (r.value.error) {
      console.error(
        `[email] Resend-Fehler beim Versand an ${r.value.to}:`,
        r.value.error,
      );
    }
  }
}
