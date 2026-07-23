import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendInvoiceOverdueEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * Cron-Route: findet unbezahlte Rechnungen, deren Zahlungsfrist abgelaufen
 * ist, und benachrichtigt den Projekt-Verantwortlichen per Mail (Absender
 * „Zahlungsfrist überzogen | Firma"). Wird via vercel.json täglich morgens
 * aufgerufen.
 *
 * Jede Rechnung löst genau eine Mail aus: `overdueNotifiedAt` wird nur bei
 * erfolgreichem Versand gesetzt — schlägt der Versand fehl (oder hat das
 * Projekt noch keinen Verantwortlichen mit E-Mail), versucht es der
 * nächste Lauf erneut.
 *
 * Auth: Vercel Cron sendet CRON_SECRET als Bearer-Token mit. Ohne gesetztes
 * CRON_SECRET ist die Route gesperrt (kein offener Endpoint).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  // Nur reguläre Rechnungen — Mahnungen (kind REMINDER) haben zwar auch
  // eine Frist, sind aber selbst schon die Eskalation.
  const overdue = await prisma.invoice.findMany({
    where: {
      kind: "INVOICE",
      paidAt: null,
      overdueNotifiedAt: null,
      dueDate: { lt: now },
    },
    select: {
      id: true,
      number: true,
      date: true,
      dueDate: true,
      totalNet: true,
      totalGross: true,
      project: {
        select: {
          id: true,
          name: true,
          customer: { select: { name: true } },
          maintainer: { select: { name: true, email: true } },
        },
      },
    },
  });

  // Origin für den Projekt-Link in der Mail — Vercel Cron ruft die
  // Production-Domain auf, daher aus den Request-Headers ableitbar.
  const host =
    (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "")
      .split(",")[0]
      .trim();
  const proto =
    (req.headers.get("x-forwarded-proto") ?? "").split(",")[0].trim() ||
    (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = host ? `${proto}://${host}` : null;

  let sent = 0;
  let skipped = 0;
  for (const inv of overdue) {
    const maintainer = inv.project.maintainer;
    if (!maintainer?.email) {
      console.warn(
        `[cron] Rechnung ${inv.number} überfällig, aber Projekt "${inv.project.name}" hat keinen Verantwortlichen mit E-Mail — übersprungen.`,
      );
      skipped++;
      continue;
    }

    const ok = await sendInvoiceOverdueEmail({
      invoiceNumber: inv.number,
      invoiceDate: inv.date,
      dueDate: inv.dueDate,
      amount: Number(inv.totalGross ?? inv.totalNet),
      projectId: inv.project.id,
      projectName: inv.project.name,
      customerName: inv.project.customer?.name ?? null,
      maintainerEmail: maintainer.email,
      maintainerName: maintainer.name,
      baseUrl,
    });
    if (ok) {
      await prisma.invoice.update({
        where: { id: inv.id },
        data: { overdueNotifiedAt: now },
      });
      sent++;
    } else {
      skipped++;
    }
  }

  return NextResponse.json({ ok: true, checked: overdue.length, sent, skipped });
}
