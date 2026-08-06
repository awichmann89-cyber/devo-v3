import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { InvoicesTable } from "../invoices-table";

export default async function FinancesInvoicesPage() {
  await requireAuth();

  const invoices = await prisma.invoice.findMany({
    // Stumpf nach Datum: älteste oben, neuste unten.
    orderBy: { date: "asc" },
    include: {
      project: {
        select: { id: true, name: true, customer: { select: { name: true } } },
      },
    },
  });

  const rows = invoices.map((inv) => ({
    id: inv.id,
    number: inv.number,
    kind: inv.kind,
    reminderLevel: inv.reminderLevel,
    relatedInvoiceId: inv.relatedInvoiceId,
    isPrepayment: inv.isPrepayment,
    date: inv.date.toISOString(),
    dueDate: inv.dueDate.toISOString(),
    totalNet: Number(inv.totalNet),
    totalGross: inv.totalGross !== null ? Number(inv.totalGross) : null,
    paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
    projectId: inv.project.id,
    projectName: inv.project.name,
    customerName: inv.project.customer?.name ?? null,
  }));

  return <InvoicesTable rows={rows} />;
}
