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
      include: { category: true },
    }),
    getSettings(),
  ]);

  if (!device) notFound();

  const items: { label: string; value: string | null }[] = [
    { label: "Hersteller", value: device.manufacturer },
    { label: "Modell", value: device.model },
    { label: "Kategorie", value: device.category?.name ?? null },
    {
      label: "Gewicht (pro Stück)",
      value: device.weight ? `${device.weight} kg` : null,
    },
    {
      label: "Leistung (pro Stück)",
      value: device.powerWatts ? `${device.powerWatts} W` : null,
    },
    {
      label: "DGUV V3 Prüfung",
      value: device.inspectionExempt ? "Nicht erforderlich" : "Erforderlich",
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
        <h1 className="text-3xl font-bold tracking-tight">{device.name}</h1>
        {(device.manufacturer || device.model) && (
          <p className="mt-2 text-muted-foreground">
            {[device.manufacturer, device.model].filter(Boolean).join(" ")}
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
        {device.description && (
          <div className="mt-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Beschreibung
            </h2>
            <p className="whitespace-pre-line text-sm">{device.description}</p>
          </div>
        )}
      </section>
    </main>
  );
}
