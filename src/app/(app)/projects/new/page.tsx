import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectForm } from "../project-form";

export default async function NewProjectPage() {
  const customers = await prisma.customer.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Neues Projekt</h1>
        <p className="text-muted-foreground">Lege ein neues Projekt mit Planungs- und Berechnungszeitraum an</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Stammdaten</CardTitle></CardHeader>
        <CardContent>
          <ProjectForm customers={customers} />
        </CardContent>
      </Card>
    </div>
  );
}
