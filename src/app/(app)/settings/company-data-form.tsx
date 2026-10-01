"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QuantityInput } from "@/components/ui/quantity-input";
import { Label } from "@/components/ui/label";
import { InfoHint } from "@/components/ui/info-hint";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { saveCompanyData, type CompanyDataInput } from "./settings-actions";
import { toastError } from "@/lib/toast";
import { buildCompanyFooterColumns } from "@/lib/company-footer";

type Props = { initial: CompanyDataInput };

type TextField = Exclude<keyof CompanyDataInput, "vatPercent">;

export function CompanyDataForm({ initial }: Props) {
  const [data, setData] = useState<CompanyDataInput>(initial);
  const [pending, startTransition] = useTransition();

  const set = (key: TextField) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setData((d) => ({ ...d, [key]: e.target.value }));

  const previewLine = [data.name, data.street, data.zipCity]
    .filter(Boolean)
    .join(" · ");
  const footerColumns = buildCompanyFooterColumns({
    companyName: data.name,
    companyStreet: data.street,
    companyZipCity: data.zipCity,
    companyPhone: data.phone,
    companyEmail: data.email,
    companyWebsite: data.website,
    companyManagement: data.management,
    companyRegister: data.register,
    companyTaxNumber: data.taxNumber,
    companyVatId: data.vatId,
    bankAccountHolder: data.bankAccountHolder,
    bankName: data.bankName,
    bankIban: data.bankIban,
    bankBic: data.bankBic,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await saveCompanyData(data);
        toast.success("Firmendaten gespeichert");
      } catch (err) {
        toastError(err, "Speichern");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="companyName">Firmenname</Label>
          <Input
            id="companyName"
            value={data.name}
            onChange={set("name")}
            placeholder="z.B. Musterfirma GmbH"
            maxLength={200}
          />
        </div>
        <div className="space-y-2">
          <Label>Anschrift</Label>
          <div className="space-y-2">
            <Input
              id="companyStreet"
              value={data.street}
              onChange={set("street")}
              placeholder="Straße, Hausnummer"
              maxLength={200}
            />
            <Input
              id="companyZipCity"
              value={data.zipCity}
              onChange={set("zipCity")}
              placeholder="PLZ, Ort"
              maxLength={200}
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="vatPercent">Mehrwertsteuersatz (%)</Label>
            <InfoHint text="Wird auf Rechnungen als MwSt. aus dem Nettobetrag berechnet. Deutschland Regel: 19 %. Bei 0 % gilt die Kleinunternehmerregelung: Angebote, Auftragsbestätigungen und Rechnungen erhalten den Hinweis nach § 19 UStG statt einer MwSt.-Zeile." />
          </div>
          <QuantityInput
            id="vatPercent"
            step={0.1}
            min={0}
            max={100}
            allowDecimal
            value={data.vatPercent}
            onChange={(v) => setData((d) => ({ ...d, vatPercent: v }))}
            className="max-w-[140px]"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Kontakt</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="companyPhone">Telefon</Label>
            <Input id="companyPhone" value={data.phone} onChange={set("phone")} maxLength={50} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyEmail">E-Mail</Label>
            <Input id="companyEmail" type="email" value={data.email} onChange={set("email")} maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyWebsite">Website</Label>
            <Input id="companyWebsite" value={data.website} onChange={set("website")} placeholder="www.musterfirma.de" maxLength={200} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Bankverbindung</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="bankName">Bank</Label>
            <Input id="bankName" value={data.bankName} onChange={set("bankName")} placeholder="z.B. Sparkasse Berlin" maxLength={200} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="bankAccountHolder">Kontoinhaber</Label>
              <InfoHint text="Nur ausfüllen, wenn der Kontoinhaber vom Firmennamen abweicht." />
            </div>
            <Input id="bankAccountHolder" value={data.bankAccountHolder} onChange={set("bankAccountHolder")} maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bankIban">IBAN</Label>
            <Input id="bankIban" value={data.bankIban} onChange={set("bankIban")} placeholder="DE12 3456 7890 1234 5678 90" maxLength={42} className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bankBic">BIC</Label>
            <Input id="bankBic" value={data.bankBic} onChange={set("bankBic")} maxLength={11} className="font-mono" />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Steuer & Register</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="companyTaxNumber">Steuernummer</Label>
            <Input id="companyTaxNumber" value={data.taxNumber} onChange={set("taxNumber")} placeholder="z.B. 12/345/67890" maxLength={50} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyVatId">USt-IdNr.</Label>
            <Input id="companyVatId" value={data.vatId} onChange={set("vatId")} placeholder="z.B. DE123456789" maxLength={50} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="companyManagement">Inhaber / Geschäftsführung</Label>
              <InfoHint text="Wird so gedruckt, wie eingegeben — z.B. „Inhaber: Max Mustermann“ oder „Geschäftsführer: Max Mustermann“." />
            </div>
            <Input id="companyManagement" value={data.management} onChange={set("management")} placeholder="Geschäftsführer: Max Mustermann" maxLength={200} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="companyRegister">Handelsregister</Label>
              <InfoHint text="Wird so gedruckt, wie eingegeben." />
            </div>
            <Input id="companyRegister" value={data.register} onChange={set("register")} placeholder="Amtsgericht Berlin, HRB 12345" maxLength={200} />
          </div>
        </div>
      </section>

      <div className="space-y-3 rounded-md border bg-muted/30 p-3 text-sm">
        <div>
          <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
            Vorschau Versenderzeile
          </div>
          <div className="font-mono text-xs">
            {previewLine || (
              <span className="italic text-muted-foreground">— noch nicht ausgefüllt —</span>
            )}
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
            Vorschau Fußzeile
          </div>
          {footerColumns.length > 0 ? (
            <div
              className="grid gap-3 border-t pt-2 text-xs text-muted-foreground"
              style={{ gridTemplateColumns: `repeat(${footerColumns.length}, minmax(0, 1fr))` }}
            >
              {footerColumns.map((col, i) => (
                <div key={i} className="min-w-0 break-words">
                  {col.map((l, j) => (
                    <div key={j}>{l}</div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <span className="text-xs italic text-muted-foreground">— noch nicht ausgefüllt —</span>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Ob die Fußzeile gedruckt wird, stellst du je Dokumentart in den Tabs
            Angebote, Auftragsbestätigungen und Rechnungen ein.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Speichern
        </Button>
      </div>
    </form>
  );
}
