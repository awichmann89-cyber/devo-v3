import { prisma } from "@/lib/prisma";
import { requireRole, CAN_ADMIN } from "@/lib/auth-helpers";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FolderTree, Receipt, FileText, Building2, CalendarClock } from "lucide-react";
import { CategoriesTree } from "./categories-tree";
import { InvoiceNumberForm } from "./invoice-number-form";
import { ReminderNumberForm } from "./reminder-number-form";
import { QuoteNumberForm } from "./quote-number-form";
import { DayFactorForm } from "./day-factor-form";
import { parseDayFactorMap } from "@/lib/settings";
import { LetterheadForm } from "./letterhead-form";
import { CompanyAddressForm } from "./company-address-form";
import { getSettings } from "@/lib/settings";
import { DaysSettingForm } from "./days-setting-form";
import { saveInvoiceDueDays, saveQuoteValidityDays } from "./settings-actions";

export default async function SettingsPage() {
  await requireRole(CAN_ADMIN);

  const year = new Date().getFullYear();
  const [categories, settings, yearInvoices, yearReminders, yearQuotes, letterheads] = await Promise.all([
    prisma.category.findMany({
      include: {
        _count: { select: { devices: true, packUnits: true, children: true } },
      },
      orderBy: { name: "asc" },
    }),
    getSettings(),
    prisma.invoice.findMany({
      where: { kind: "INVOICE", number: { startsWith: `${year}-` } },
      select: { number: true },
    }),
    prisma.invoice.findMany({
      where: { kind: "REMINDER", number: { startsWith: `${year}-` } },
      select: { number: true },
    }),
    prisma.quote.findMany({
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
  let currentYearMaxQuote = 0;
  for (const r of yearQuotes) {
    const m = r.number.match(/-(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n > currentYearMaxQuote) currentYearMaxQuote = n;
    }
  }
  let currentYearMaxReminder = 0;
  for (const r of yearReminders) {
    const m = r.number.match(/-(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n > currentYearMaxReminder) currentYearMaxReminder = n;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Einstellungen</h1>
        <p className="text-muted-foreground">Stammdaten und Konfiguration der App</p>
      </div>

      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories">
            <FolderTree className="h-4 w-4" /> Kategorien
          </TabsTrigger>
          <TabsTrigger value="invoices">
            <Receipt className="h-4 w-4" /> Rechnungen
          </TabsTrigger>
          <TabsTrigger value="quotes">
            <FileText className="h-4 w-4" /> Angebote
          </TabsTrigger>
          <TabsTrigger value="dayfactor">
            <CalendarClock className="h-4 w-4" /> Tage-Faktor
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
                Wird auf Rechnungen und Angeboten oben im Anschriftenfeld als Versenderzeile nach Briefnorm angezeigt (z.B.{" "}
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

        <TabsContent value="invoices" className="space-y-6">
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
          <Card>
            <CardHeader>
              <CardTitle>Mahnungsnummer-Format</CardTitle>
              <CardDescription>
                Eigener Nummernkreis für Mahnungen — z.B.{" "}
                <code className="font-mono">2026-M-001</code>. Läuft pro Jahr
                getrennt von den Rechnungsnummern.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReminderNumberForm
                initialPrefix={settings.reminderNumberPrefix}
                initialPadding={Number(settings.reminderNumberPadding) || 3}
                initialNextSequence={Number(settings.reminderNumberNextSequence) || 1}
                currentYearMax={currentYearMaxReminder}
                year={year}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Zahlungsfrist</CardTitle>
              <CardDescription>
                Default-Frist für neue Rechnungen — wird ab Erstellungsdatum
                gerechnet und auf der Rechnung als „zahlbar bis …" gesetzt.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DaysSettingForm
                initial={Number(settings.invoiceDueDays) || 7}
                label="Zahlungsfrist (Tage)"
                description="0 = sofort fällig. Max. 365."
                onSave={saveInvoiceDueDays}
                successMessage="Zahlungsfrist gespeichert"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dayfactor">
          <Card>
            <CardHeader>
              <CardTitle>Tage-Faktor</CardTitle>
              <CardDescription>
                Statt mit der reinen Anzahl Tage wird das Material mit einem Faktor multipliziert.
                Beispiel: 2 Tage = Faktor 1,5 (statt 2,0). Mapping gilt für 1 bis 10 Tage.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DayFactorForm initial={parseDayFactorMap(settings.dayFactorMap)} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quotes" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Angebotsnummer-Format</CardTitle>
              <CardDescription>
                Format: <code>JAHR-PREFIX-SEQUENZ</code> (z.B.{" "}
                <code className="font-mono">2026-AN-001</code>). Eigener Nummernkreis, läuft pro Jahr fortlaufend.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <QuoteNumberForm
                initialPrefix={settings.quoteNumberPrefix}
                initialPadding={Number(settings.quoteNumberPadding) || 3}
                initialNextSequence={Number(settings.quoteNumberNextSequence) || 1}
                currentYearMax={currentYearMaxQuote}
                year={year}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Gültigkeit</CardTitle>
              <CardDescription>
                Default-Gültigkeit für neue Angebote — wird ab Erstellungsdatum
                gerechnet und auf dem Angebot als „gültig bis …" gesetzt.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DaysSettingForm
                initial={Number(settings.quoteValidityDays) || 14}
                label="Gültigkeit (Tage)"
                description="0 = nur am Erstellungstag gültig. Max. 365."
                onSave={saveQuoteValidityDays}
                successMessage="Gültigkeit gespeichert"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
