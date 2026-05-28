import { prisma } from "@/lib/prisma";
import { requireRole, CAN_ADMIN } from "@/lib/auth-helpers";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FolderTree } from "lucide-react";
import { CategoriesTree } from "./categories-tree";

export default async function SettingsPage() {
  await requireRole(CAN_ADMIN);

  const categories = await prisma.category.findMany({
    include: {
      _count: { select: { devices: true, packUnits: true, children: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Einstellungen</h1>
        <p className="text-muted-foreground">Verwalte Stammdaten der App</p>
      </div>

      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories">
            <FolderTree className="h-4 w-4" /> Kategorien
          </TabsTrigger>
        </TabsList>

        <TabsContent value="categories">
          <Card>
            <CardHeader>
              <CardTitle>Kategorien & Unterkategorien</CardTitle>
              <CardDescription>
                Kategorien gelten für Geräte und Packeinheiten. Unterkategorien helfen bei
                der Strukturierung — z.B. <em>Ton → Mikrofone</em>, <em>Ton → Mischpulte</em>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CategoriesTree categories={categories} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
