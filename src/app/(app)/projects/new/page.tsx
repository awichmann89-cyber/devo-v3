import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectForm } from "../project-form";
import { auth } from "@/auth";

export default async function NewProjectPage() {
  const [customers, users, session] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    auth(),
  ]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Projekt anlegen</h1>
        <p className="text-muted-foreground">Lege ein neues Projekt mit Planungs- und Berechnungszeitraum an</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Stammdaten</CardTitle></CardHeader>
        <CardContent>
          <ProjectForm
            customers={customers}
            users={users}
            currentUserId={session?.user.id ?? null}
          />
        </CardContent>
      </Card>
    </div>
  );
}
