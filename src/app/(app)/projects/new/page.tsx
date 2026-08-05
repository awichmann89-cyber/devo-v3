import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
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
      <div className="flex items-center gap-2">
        <h1 className="text-[21px] font-extrabold tracking-tight">Projekt anlegen</h1>
        <InfoHint text="Lege ein neues Projekt mit Planungs- und Berechnungszeitraum an." />
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
