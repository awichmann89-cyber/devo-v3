import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { QuotesTable } from "../quotes-table";

export default async function FinancesQuotesPage() {
  await requireAuth();

  const quotes = await prisma.quote.findMany({
    orderBy: [{ date: "desc" }],
    include: {
      project: {
        select: { id: true, name: true, customer: { select: { name: true } } },
      },
    },
  });

  const rows = quotes.map((q) => ({
    id: q.id,
    number: q.number,
    date: q.date.toISOString(),
    expiresAt: q.expiresAt.toISOString(),
    totalNet: Number(q.totalNet),
    totalGross: q.totalGross !== null ? Number(q.totalGross) : null,
    projectId: q.project.id,
    projectName: q.project.name,
    customerName: q.project.customer?.name ?? null,
    acceptedAt: q.acceptedAt ? q.acceptedAt.toISOString() : null,
    acceptedByName: q.acceptedByName,
    supersededByQuoteId: q.supersededByQuoteId,
  }));

  return <QuotesTable rows={rows} />;
}
