import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { InfoHint } from "@/components/ui/info-hint";
import { PackUnitForm } from "../pack-unit-form";

export default async function NewPackUnitPage() {
  const [locations, categories] = await Promise.all([
    prisma.location.findMany({ orderBy: { name: "asc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/material?tab=pack-units">
            <ArrowLeft className="h-4 w-4" /> Zurück
          </Link>
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <h1 className="text-[21px] font-extrabold tracking-tight">Packeinheit anlegen</h1>
        <InfoHint text="Erstelle ein neues Case, Rack oder Tasche. Geräte kannst du nach dem Anlegen zuordnen." />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stammdaten</CardTitle>
        </CardHeader>
        <CardContent>
          <PackUnitForm locations={locations} categories={categories} />
        </CardContent>
      </Card>
    </div>
  );
}
