import { prisma } from "@/lib/prisma";
import { requireRole, CAN_ADMIN } from "@/lib/auth-helpers";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FolderTree, Receipt, FileText, Building2 } from "lucide-react";
import { CategoriesTree } from "./categories-tree";
import { InvoiceNumberForm } from "./invoice-number-form";
import { LetterheadForm } from "./letterhead-form";
import { CompanyAddressForm } from "./company-address-form";
import { getSettings } from "@/lib/settings";

export default async function SettingsPage() {
  await requireRole(CAN_ADMIN);

  const year = new Date().getFullYear();
  const [categories, settings, yearInvoices, letterheads] = await Promise.all([
    prisma.category.findMany({
      include: {
        _count: { select: { devices: true, packUnits: true, children: true } },
      },
      orderBy: { name: "asc" },
    }),
    getSettings(),
    prisma.invoice.findMany({
      where: { number: { startsWith: `${year}-` } },
      select: { number: true },
    }),
    prisma.letterheadTemplate.findMany({
      select: { kind: true, fileName: true, updatedAt: true },
    }),
  ]);
  const first = letterheads.find((l) => l.kind === "FIRST_PAGE") ?? null;
  const following = letterheads.find((l) => l.kind === "FOLLOWING_PAGES") ?? null;

  let currentYearMax = 0;
  for (const r of yearInvoices) {
    const m = r.number.match(/-(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n > currentYearMax) currentYearMax = n;
    }
  }

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
          <TabsTrigger value="invoices">
            <Receipt className="h-4 w-4" /> Rechnungsnummer
          </TabsTrigger>
          <TabsTrigger value="letterhead">
            <FileText className="h-4 w-4" /> Briefpapier
          </TabsTrigger>
          <TabsTrigger value="company">
            <Building2 className="h-4 w-4" /> Firmenadresse
          </TabsTrigger>
        </TabsList>

        <TabsContent value="categories">
          <Card>
            <CardHeader>
              <CardTitle>Kategorien & Unterkategorien</CardTitle>
              <CardDescription>
                Kategorien gelten für Geräte und Packeinheiten. Unterkategorien helfen bei der Strukturierung — z.B. <em>Ton → Mikrofone</em>, <em>Ton → Mischpulte</em>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CategoriesTree categories={categories} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="company">
          <Card>
            <CardHeader>
              <CardTitle>Firmenadresse (Versender)</CardTitle>
              <CardDescription>
                Wird auf Rechnungen oben im Anschriftenfeld als Versenderzeile nach Briefnorm angezeigt (z.B.{" "}
                <em>Musterfirma GmbH · Musterstr. 1 · 12345 Berlin</em>).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CompanyAddressForm
                initialName={settings.companyName}
                initialStreet={settings.companyStreet}
                initialZipCity={settings.companyZipCity}
                initialVatPercent={Number(settings.vatPercent) || 19}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="letterhead">
          <Card>
            <CardHeader>
              <CardTitle>Briefpapier-Vorlagen</CardTitle>
              <CardDescription>
                Lade PDFs hoch, die als Hintergrund der Rechnungs-PDFs verwendet werden. Der Rechnungs-Inhalt wird darüber gelegt. Format A4 hochkant empfohlen.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LetterheadForm
                first={first ? { kind: first.kind, fileName: first.fileName, updatedAt: first.updatedAt.toISOString() } : null}
                following={following ? { kind: following.kind, fileName: following.fileName, updatedAt: following.updatedAt.toISOString() } : null}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <Card>
            <CardHeader>
              <CardTitle>Rechnungsnummer-Format</CardTitle>
              <CardDescription>
                Format: <code>JAHR-PREFIX-SEQUENZ</code> (z.B.{" "}
                <code className="font-mono">2026-PA-001</code>). Die Sequenz läuft pro Jahr fortlaufend und beginnt am 1.&nbsp;Januar wieder bei&nbsp;1.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InvoiceNumberForm
                initialPrefix={settings.invoiceNumberPrefix}
                initialPadding={Number(settings.invoiceNumberPadding) || 3}
                initialNextSequence={Number(settings.invoiceNumberNextSequence) || 1}
                currentYearMax={currentYearMax}
                year={year}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
