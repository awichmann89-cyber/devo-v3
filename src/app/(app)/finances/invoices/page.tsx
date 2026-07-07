import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Rechnungen</h1>
        <p className="text-muted-foreground">
          Rechnungen mit Status, Fälligkeit und Zahlungseingang
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Noch keine Rechnungen vorhanden. Erstelle eine Rechnung im Finanzen-Tab
            eines Projekts.
          </CardContent>
        </Card>
      ) : (
        <InvoicesTable rows={rows} />
      )}
    </div>
  );
}
