import Link from "next/link";
import { requireAuth } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { InfoHint } from "@/components/ui/info-hint";
import { InspectionScanner } from "./inspection-scanner";

export default async function InspectionPage() {
  await requireAuth();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/material">
            <ArrowLeft className="h-4 w-4" /> Zurück
          </Link>
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <h1 className="text-[21px] font-extrabold tracking-tight">Prüfungsmodus</h1>
        <InfoHint text="DGUV V3 Prüfung für Geräte und Kabel — Barcode scannen oder Seriennummer eingeben, Ergebnis erfassen." />
      </div>

      <InspectionScanner />
    </div>
  );
}
