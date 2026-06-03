import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomersTable } from "./customers-table";

export default async function CustomersPage() {
  const customers = await prisma.customer.findMany({
    include: { _count: { select: { projects: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Kunden</h1>
        <p className="text-muted-foreground">Stammdaten der Kunden für Projekte und Angebote</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{customers.length} Kunden</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomersTable customers={customers} />
        </CardContent>
      </Card>
    </div>
  );
}
