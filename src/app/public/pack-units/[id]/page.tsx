import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function PublicPackUnitPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const [packUnit, settings] = await Promise.all([
    prisma.packUnit.findUnique({
      where: { id },
      include: {
        location: true,
        items: {
          include: { device: true },
          orderBy: { device: { name: "asc" } },
        },
      },
    }),
    getSettings(),
  ]);

  if (!packUnit) notFound();

  const totalDevices = packUnit.items.reduce((s, it) => s + it.quantity, 0);

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
        <h1 className="text-3xl font-bold tracking-tight">{packUnit.name}</h1>
        {packUnit.description && (
          <p className="mt-2 text-muted-foreground">{packUnit.description}</p>
        )}
        <dl className="mt-3 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
          {packUnit.weight && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Gewicht:</dt>
              <dd className="font-medium">
                {Number(packUnit.weight).toString().replace(".", ",")} kg
              </dd>
            </div>
          )}
          {packUnit.location?.name && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Lagerort:</dt>
              <dd className="font-medium">{packUnit.location.name}</dd>
            </div>
          )}
        </dl>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Inhalt ({totalDevices} {totalDevices === 1 ? "Gerät" : "Geräte"})
        </h2>
        {packUnit.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Geräte hinterlegt.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {packUnit.items.map((it) => {
              const make = [it.device.manufacturer, it.device.model]
                .filter(Boolean)
                .join(" ");
              return (
                <li
                  key={it.id}
                  className="flex items-start gap-4 px-4 py-3"
                >
                  {/* Anzahl nach vorne — auf einen Blick erkennbar wie viele
                      Stück von jedem Gerät in der Packeinheit liegen. */}
                  <div className="shrink-0 text-sm tabular-nums">
                    <span className="font-semibold">{it.quantity}</span>×
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{it.device.name}</p>
                    {make && (
                      <p className="text-xs text-muted-foreground">{make}</p>
                    )}
                    {it.device.description?.trim() && (
                      <p className="mt-1 text-xs text-muted-foreground whitespace-pre-line">
                        {it.device.description}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
