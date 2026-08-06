import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { ProjectKind, ProjectStatus } from "@prisma/client";
import { PendingTable } from "./pending-table";

export default async function PendingInvoicingPage() {
  await requireAuth();

  const now = new Date();

  const projects = await prisma.project.findMany({
    where: {
      planningEnd: { lt: now },
      kind: { not: ProjectKind.SPENDE },
      status: { not: ProjectStatus.CANCELLED },
      invoices: { none: {} },
    },
    select: {
      id: true,
      name: true,
      status: true,
      kind: true,
      planningStart: true,
      planningEnd: true,
      customer: { select: { name: true } },
    },
    orderBy: { planningEnd: "asc" },
  });

  const rows = projects.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    kind: p.kind,
    planningStart: p.planningStart.toISOString(),
    planningEnd: p.planningEnd.toISOString(),
    customerName: p.customer?.name ?? null,
  }));

  return <PendingTable rows={rows} />;
}
