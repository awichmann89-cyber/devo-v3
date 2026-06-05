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
        {packUnit.location?.name && (
          <p className="mt-2 text-sm">
            <span className="text-muted-foreground">Lagerort:</span>{" "}
            {packUnit.location.name}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Inhalt ({totalDevices} {totalDevices === 1 ? "Gerät" : "Geräte"})
        </h2>
        {packUnit.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Geräte hinterlegt.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {packUnit.items.map((it) => (
              <li
                key={it.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div>
                  <p className="font-medium">{it.device.name}</p>
                  {(it.device.manufacturer || it.device.model) && (
                    <p className="text-xs text-muted-foreground">
                      {[it.device.manufacturer, it.device.model]
                        .filter(Boolean)
                        .join(" ")}
                    </p>
                  )}
                </div>
                <div className="text-sm tabular-nums">
                  <span className="font-semibold">{it.quantity}</span>×
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
