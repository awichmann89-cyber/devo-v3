import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import { SignatureForm } from "./signature-form";

export default async function ProfilePage() {
  const session = await requireAuth();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { signatureHtml: true },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-[21px] font-extrabold tracking-tight">Mein Profil</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            E-Mail-Signatur
            <InfoHint text="Wird beim Versand von Angeboten und Rechnungen per E-Mail unter den Nachrichtentext gesetzt." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SignatureForm initialHtml={user?.signatureHtml ?? ""} />
        </CardContent>
      </Card>
    </div>
  );
}
