import { prisma } from "@/lib/prisma";
import { CustomersTable } from "./customers-table";

export default async function CustomersPage() {
  const customers = await prisma.customer.findMany({
    include: { _count: { select: { projects: true } } },
    orderBy: { name: "asc" },
  });

  return <CustomersTable customers={customers} />;
}
