import { prisma } from "@/lib/prisma";
import { requireRole, CAN_ADMIN } from "@/lib/auth-helpers";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import { FolderTree, Receipt, FileText, Building2, CalendarClock, Mail } from "lucide-react";
import { CategoriesTree } from "./categories-tree";
import { InvoiceNumberForm } from "./invoice-number-form";
import { ReminderNumberForm } from "./reminder-number-form";
import { QuoteNumberForm } from "./quote-number-form";
import { QuoteTextsForm } from "./quote-texts-form";
import { QuoteEmailTextsForm, InvoiceEmailTextsForm } from "./email-texts-form";
import { DayFactorForm } from "./day-factor-form";
import { parseDayFactorMap } from "@/lib/settings";
import { LetterheadForm } from "./letterhead-form";
import { CompanyAddressForm } from "./company-address-form";
import { PdfAccentColorForm } from "./pdf-accent-color-form";
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
    <div className="space-y-4">
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
          <TabsTrigger value="email">
            <Mail className="h-4 w-4" /> E-Mail
          </TabsTrigger>
        </TabsList>

        <TabsContent value="categories">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Kategorien & Unterkategorien
                <InfoHint
                  text={
                    <>
                      Kategorien gelten für Geräte und Packeinheiten.
                      Unterkategorien helfen bei der Strukturierung — z.B.{" "}
                      <em>Ton → Mikrofone</em>, <em>Ton → Mischpulte</em>.
                    </>
                  }
                />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CategoriesTree categories={categories} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="company">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Firmenadresse (Versender)
                <InfoHint
                  text={
                    <>
                      Wird auf Rechnungen und Angeboten oben im Anschriftenfeld
                      als Versenderzeile nach Briefnorm angezeigt (z.B.{" "}
                      <em>Musterfirma GmbH · Musterstr. 1 · 12345 Berlin</em>).
                    </>
                  }
                />
              </CardTitle>
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

        <TabsContent value="letterhead" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Briefpapier-Vorlagen
                <InfoHint text="Lade PDFs hoch, die als Hintergrund der Rechnungs-PDFs verwendet werden. Der Rechnungs-Inhalt wird darüber gelegt. Format A4 hochkant empfohlen." />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LetterheadForm
                first={first ? { kind: first.kind, fileName: first.fileName, updatedAt: first.updatedAt.toISOString() } : null}
                following={following ? { kind: following.kind, fileName: following.fileName, updatedAt: following.updatedAt.toISOString() } : null}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Akzentfarbe
                <InfoHint text="Farbe für Gruppen-Überschriften und Trennstriche in Angebots- und Rechnungs-PDFs. Bereits ausgegebene Dokumente behalten ihre ursprüngliche Farbe (Snapshot), neue verwenden die hier gewählte." />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PdfAccentColorForm initialColor={settings.pdfAccentColor} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Rechnungsnummer-Format
                <InfoHint
                  text={
                    <>
                      Format: <code>JAHR-PREFIX-SEQUENZ</code> (z.B.{" "}
                      <code className="font-mono">2026-PA-001</code>). Die
                      Sequenz läuft pro Jahr fortlaufend und beginnt am
                      1.&nbsp;Januar wieder bei&nbsp;1.
                    </>
                  }
                />
              </CardTitle>
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
              <CardTitle className="flex items-center gap-2">
                Mahnungsnummer-Format
                <InfoHint
                  text={
                    <>
                      Eigener Nummernkreis für Mahnungen — z.B.{" "}
                      <code className="font-mono">2026-M-001</code>. Läuft pro
                      Jahr getrennt von den Rechnungsnummern.
                    </>
                  }
                />
              </CardTitle>
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
              <CardTitle className="flex items-center gap-2">
                Zahlungsfrist
                <InfoHint text={'Default-Frist für neue Rechnungen — wird ab Erstellungsdatum gerechnet und auf der Rechnung als „zahlbar bis …" gesetzt.'} />
              </CardTitle>
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
              <CardTitle className="flex items-center gap-2">
                Tage-Faktor
                <InfoHint text="Statt mit der reinen Anzahl Tage wird das Material mit einem Faktor multipliziert. Beispiel: 2 Tage = Faktor 1,5 (statt 2,0). Mapping gilt für 1 bis 10 Tage. Bei mehr als 10 Tagen wird linear fortgesetzt: Faktor[10] + (Tage − 10) — bei Faktor[10] = 5,5 sind 12 Tage = 7,5." />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DayFactorForm initial={parseDayFactorMap(settings.dayFactorMap)} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quotes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Angebotsnummer-Format
                <InfoHint
                  text={
                    <>
                      Format: <code>JAHR-PREFIX-SEQUENZ</code> (z.B.{" "}
                      <code className="font-mono">2026-AN-001</code>). Eigener
                      Nummernkreis, läuft pro Jahr fortlaufend.
                    </>
                  }
                />
              </CardTitle>
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
              <CardTitle className="flex items-center gap-2">
                Gültigkeit
                <InfoHint text={'Default-Gültigkeit für neue Angebote — wird ab Erstellungsdatum gerechnet und auf dem Angebot als „gültig bis …" gesetzt.'} />
              </CardTitle>
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Texte im Angebots-PDF
                <InfoHint text="Standardtexte vor und nach der Positionstabelle. Pro Angebot kann zusätzlich ein individueller Hinweistext im Dialog eingegeben werden — der erscheint zwischen Tabelle und Schlusstext." />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <QuoteTextsForm
                initialIntro={settings.quoteIntroText}
                initialOutro={settings.quoteOutroText}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                E-Mail-Text: Angebot
                <InfoHint text={'Betreff und Text, mit denen der "Per E-Mail senden"-Dialog beim Erstellen eines Angebots vorbefüllt wird. Vor dem Versand im Dialog noch editierbar.'} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <QuoteEmailTextsForm
                initialSubject={settings.quoteEmailSubject}
                initialBody={settings.quoteEmailBody}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                E-Mail-Text: Rechnung
                <InfoHint text={'Betreff und Text, mit denen der "Per E-Mail senden"-Dialog beim Erstellen einer Rechnung vorbefüllt wird. Vor dem Versand im Dialog noch editierbar.'} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <InvoiceEmailTextsForm
                initialSubject={settings.invoiceEmailSubject}
                initialBody={settings.invoiceEmailBody}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
