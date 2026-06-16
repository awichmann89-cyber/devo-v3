import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function PublicDevicePage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const [device, settings] = await Promise.all([
    prisma.device.findUnique({
      where: { id },
      include: {
        category: true,
        // Seriennummern für den Seriennummern-Block weiter unten.
        serialNumbers: {
          orderBy: { serialNumber: "asc" },
          select: { serialNumber: true, barcode: true, notes: true },
        },
      },
    }),
    getSettings(),
  ]);

  if (!device) notFound();

  // Stammdaten-Tabelle für die Public-Ansicht. Kategorie und DGUV-Status
  // sind für Freelancer/Fremdfirmen relevante Eckdaten beim Sichten; Gewicht
  // und Leistung beim Tragen und Stromplanen.
  const items: { label: string; value: string | null }[] = [
    { label: "Kategorie", value: device.category?.name ?? null },
    {
      label: "DGUV V3 Prüfung",
      value: device.inspectionExempt ? "Nicht erforderlich" : "Erforderlich",
    },
    {
      label: "Gewicht (pro Stück)",
      value: device.weight
        ? `${Number(device.weight).toString().replace(".", ",")} kg`
        : null,
    },
    {
      label: "Leistung (pro Stück)",
      value: device.powerWatts ? `${device.powerWatts} W` : null,
    },
  ].filter((it) => it.value);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <header className="mb-8 border-b pb-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Eigentümer
        </p>
        <p className="text-lg font-semibold">
          {settings.companyName || "—"}
        </p>
        {(settings.companyStreet || settings.companyZipCity) && (
          <p className="text-sm text-muted-foreground whitespace-pre-line">
            {[settings.companyStreet, settings.companyZipCity]
              .filter(Boolean)
              .join("\n")}
          </p>
        )}
      </header>

      <section className="mb-8">
        {/* Titel: Hersteller + Modell wenn vorhanden, sonst fällt auf den
            internen Geräte-Namen zurück. Für Freelancer/Fremdfirmen ist
            "Coda Audio G308 Pro" griffiger als ein interner Inventarname. */}
        <h1 className="text-3xl font-bold tracking-tight">
          {[device.manufacturer, device.model].filter(Boolean).join(" ") ||
            device.name}
        </h1>
        {device.description?.trim() && (
          <p className="mt-2 text-muted-foreground whitespace-pre-line">
            {device.description}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Stammdaten
        </h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Angaben hinterlegt.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {items.map((it) => (
              <li
                key={it.label}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <span className="text-sm text-muted-foreground">{it.label}</span>
                <span className="text-sm font-medium">{it.value}</span>
              </li>
            ))}
          </ul>
        )}

        {device.serialNumbers.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Seriennummern ({device.serialNumbers.length})
            </h2>
            <ul className="divide-y rounded-md border">
              {device.serialNumbers.map((sn) => (
                <li
                  key={sn.serialNumber}
                  className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <span className="text-sm font-mono font-medium">
                    {sn.serialNumber}
                  </span>
                  {sn.barcode && (
                    <span className="text-xs text-muted-foreground font-mono">
                      Barcode: {sn.barcode}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
