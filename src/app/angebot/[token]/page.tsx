import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { isValidSnapshot, type DocumentSnapshot } from "@/lib/document-snapshot";
import { AcceptanceForm } from "./acceptance-form";
import { formatCurrency, formatDate } from "@/lib/utils";
import { deviceRowLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ ersetzt?: string }>;
}

/**
 * Public-Page für ein Angebot, erreichbar via Token ohne Login.
 *
 * Drei Zustände:
 *   1. Offen → Snapshot-Rendering + AcceptanceForm
 *   2. Bereits angenommen → Bestätigungs-Box mit Signatur-Vorschau
 *   3. Abgelaufen (und nicht angenommen) → Hinweis-Box mit Kontakt-Info
 *
 * Wenn das Angebot überschrieben wurde (supersededByQuoteId gesetzt),
 * folgen wir der Kette bis zum aktuellsten Nachfolger und redirecten dort
 * hin mit ?ersetzt=1, sodass das Banner angezeigt wird.
 */
export default async function PublicQuotePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { ersetzt } = await searchParams;

  let quote = await prisma.quote.findUnique({
    where: { acceptToken: token },
    include: {
      project: { select: { id: true, name: true } },
    },
  });
  if (!quote) notFound();

  // Supersession-Kette folgen — wenn dieses Angebot ersetzt wurde, weiterleiten
  // auf die finale (aktuelle) Version. Max. 10 Hops als Schutz vor Zyklen.
  if (quote.supersededByQuoteId) {
    let current = quote;
    let hops = 0;
    while (current.supersededByQuoteId && hops < 10) {
      const next = await prisma.quote.findUnique({
        where: { id: current.supersededByQuoteId },
        include: { project: { select: { id: true, name: true } } },
      });
      if (!next || !next.acceptToken) break;
      current = next;
      hops++;
    }
    if (current.acceptToken && current.acceptToken !== token) {
      redirect(`/angebot/${current.acceptToken}?ersetzt=1`);
    }
  }

  // Snapshot ist Pflicht für die Public-Page — ohne Snapshot kein Render.
  // Sollte praktisch immer vorhanden sein da Quotes seit dem Snapshot-Feature
  // bei Erstellung gefüllt werden.
  if (!isValidSnapshot(quote.snapshot)) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle>Angebot nicht verfügbar</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Dieses Angebot kann derzeit nicht angezeigt werden. Bitte
              wenden Sie sich an den Aussteller.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }
  const snapshot = quote.snapshot as DocumentSnapshot;

  const now = new Date();
  const isExpired = quote.expiresAt && quote.expiresAt < now;
  const isAccepted = quote.acceptedAt !== null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12 space-y-6">
      {/* "Neue Version" Banner — wenn der Kunde auf einer alten Token-URL war
          und auf die aktuelle Version umgeleitet wurde. */}
      {ersetzt === "1" && (
        <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning-subtle px-4 py-3 text-sm text-warning">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">Dies ist eine aktualisierte Version</div>
            <p className="mt-0.5">
              Die ursprüngliche Anfrage wurde zwischenzeitlich durch ein neues
              Angebot ({quote.number}) ersetzt. Bitte prüfen Sie die aktuellen
              Positionen.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-1 border-b pb-4 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Angebot {quote.number}
          </h1>
          <p className="text-sm text-muted-foreground">
            Vom {formatDate(quote.date)} · Gültig bis{" "}
            {formatDate(quote.expiresAt)}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={`/angebot/${token}/pdf?download=1`} rel="noopener">
            <Download className="h-4 w-4" /> Als PDF
          </a>
        </Button>
      </div>

      {/* Status-Box je nach Zustand */}
      {isAccepted ? (
        <AcceptedBox
          name={quote.acceptedByName ?? ""}
          acceptedAt={quote.acceptedAt!}
          signaturePng={quote.acceptedSignaturePng ?? null}
        />
      ) : isExpired ? (
        <ExpiredBox expiresAt={quote.expiresAt} />
      ) : null}

      {/* Snapshot-Rendering: Empfänger, Tabellen, Summen */}
      <QuoteSnapshotView snapshot={snapshot} quoteNumber={quote.number} notes={quote.notes} />

      {/* Acceptance-Formular nur wenn offen UND nicht abgelaufen */}
      {!isAccepted && !isExpired && (
        <AcceptanceForm token={token} quoteNumber={quote.number} />
      )}

      {/* Footer-Hinweis */}
      <div className="border-t pt-6 text-center text-xs text-muted-foreground">
        <p>{snapshot.settings.companyName}</p>
      </div>
    </main>
  );
}

function AcceptedBox({
  name,
  acceptedAt,
  signaturePng,
}: {
  name: string;
  acceptedAt: Date;
  signaturePng: string | null;
}) {
  return (
    <div className="rounded-md border border-success/40 bg-success-subtle px-5 py-4 text-sm text-success">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="flex-1">
          <div className="text-base font-semibold">Angebot angenommen</div>
          <p className="mt-0.5">
            Bestätigt am {formatDate(acceptedAt)}
            {name && (
              <>
                {" "}
                durch <strong>{name}</strong>
              </>
            )}
            . Vielen Dank!
          </p>
          {signaturePng && (
            <div className="mt-3">
              <div className="mb-1 text-xs text-muted-foreground">Unterschrift</div>
              <div className="inline-block rounded border bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={signaturePng} alt="Unterschrift" className="max-h-24" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ExpiredBox({ expiresAt }: { expiresAt: Date }) {
  return (
    <div className="rounded-md border border-warning/40 bg-warning-subtle px-5 py-4 text-sm text-warning">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <div className="text-base font-semibold">Angebot abgelaufen</div>
          <p className="mt-0.5">
            Dieses Angebot war gültig bis {formatDate(expiresAt)}. Bitte
            fragen Sie ein neues an, wenn Sie weiterhin interessiert sind.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Snapshot-Renderer: zeigt Empfänger, alle Material-/Service-Gruppen mit
 * Items, Summen-Tabelle.
 */
function QuoteSnapshotView({
  snapshot,
  quoteNumber,
  notes,
}: {
  snapshot: DocumentSnapshot;
  quoteNumber: string;
  notes: string | null;
}) {
  const customer = snapshot.customer;
  const factor = snapshot.factor;
  const isSale = snapshot.isSale;
  const projectName = snapshot.project.name;
  const billingPeriods = snapshot.project.billingPeriods.map((p) => ({
    start: new Date(p.start),
    end: new Date(p.end),
  }));

  // Summen berechnen — identisch zur PDF-Logik
  type GroupCalc = { sub: number; disc: number; net: number };
  const groupCalc = new Map<string, GroupCalc>();
  for (const g of snapshot.groups) {
    if (g.kind === "MATERIAL") {
      const subDevices = g.materialRows.reduce(
        (s, r) => s + r.dailyRate * r.quantity * factor,
        0,
      );
      const subAdHoc = g.adHocRows.reduce(
        (s, r) => s + r.unitPrice * r.quantity * factor,
        0,
      );
      const sub = subDevices + subAdHoc;
      const disc = (sub * g.discountPercent) / 100;
      groupCalc.set(g.id, { sub, disc, net: sub - disc });
    } else {
      const sub = g.serviceRows.reduce((s, r) => s + r.quantity * r.price, 0);
      const disc = (sub * g.discountPercent) / 100;
      groupCalc.set(g.id, { sub, disc, net: sub - disc });
    }
  }
  const materialGroups = snapshot.groups.filter((g) => g.kind === "MATERIAL");
  const serviceGroups = snapshot.groups.filter((g) => g.kind === "SERVICE");
  const materialBereichSub = materialGroups.reduce(
    (s, g) => s + (groupCalc.get(g.id)?.net ?? 0),
    0,
  );
  const servicesBereichSub = serviceGroups.reduce(
    (s, g) => s + (groupCalc.get(g.id)?.net ?? 0),
    0,
  );
  const materialBereichDisc =
    (materialBereichSub * snapshot.project.materialDiscountPercent) / 100;
  const servicesBereichDisc =
    (servicesBereichSub * snapshot.project.servicesDiscountPercent) / 100;
  const materialBereichNet = materialBereichSub - materialBereichDisc;
  const servicesBereichNet = servicesBereichSub - servicesBereichDisc;
  const subAfterAll = materialBereichNet + servicesBereichNet;
  const projectDiscount =
    (subAfterAll * snapshot.project.discountPercent) / 100;
  const totalNet = subAfterAll - projectDiscount;
  const vatAmount = (totalNet * snapshot.settings.vatPercent) / 100;
  const totalGross = totalNet + vatAmount;

  return (
    <div className="space-y-6">
      {/* Empfänger */}
      {customer && (
        <Card>
          <CardHeader className="pb-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Angebot für
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              {customer.name && <div className="font-medium">{customer.name}</div>}
              {customer.contactPerson && <div>{customer.contactPerson}</div>}
              {customer.address && (
                <div className="whitespace-pre-line text-muted-foreground">
                  {customer.address}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Projekt-Meta */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Projekt</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <div>
            <span className="text-muted-foreground">Bezeichnung:</span>{" "}
            <span className="font-medium">{projectName}</span>
          </div>
          {!isSale && billingPeriods.length > 0 && (
            <div>
              <span className="text-muted-foreground">Mietzeitraum:</span>{" "}
              {(() => {
                // Eintägige Zeiträume kompakt als einzelnes Datum ausgeben —
                // analog zum PDF-Rendering.
                const fmt = (p: { start: Date; end: Date }) => {
                  const s = formatDate(p.start);
                  const e = formatDate(p.end);
                  return s === e ? s : `${s} – ${e}`;
                };
                return billingPeriods.length === 1
                  ? fmt(billingPeriods[0])
                  : billingPeriods.map(fmt).join(" | ");
              })()}{" "}
              ({snapshot.days} Tage)
            </div>
          )}
        </CardContent>
      </Card>

      {/* Intro-Text */}
      {snapshot.settings.quoteIntroText && (
        <p className="whitespace-pre-line text-sm text-muted-foreground">
          {snapshot.settings.quoteIntroText}
        </p>
      )}

      {/* Material */}
      {materialGroups.length > 0 &&
        materialGroups.some(
          (g) => g.materialRows.length > 0 || g.adHocRows.length > 0,
        ) && (
          <SnapshotSection
            title="Material"
            groups={materialGroups}
            groupCalc={groupCalc}
            factor={factor}
            isSale={isSale}
            kind="MATERIAL"
            bereichSub={materialBereichSub}
            bereichDisc={materialBereichDisc}
            bereichNet={materialBereichNet}
            bereichDiscountPercent={snapshot.project.materialDiscountPercent}
            bereichLabel="Zwischensumme Material"
            bereichDiscLabel="Material-Rabatt"
          />
        )}

      {/* Personal & Transport */}
      {serviceGroups.length > 0 &&
        serviceGroups.some((g) => g.serviceRows.length > 0) && (
          <SnapshotSection
            title="Personal & Transport"
            groups={serviceGroups}
            groupCalc={groupCalc}
            factor={factor}
            isSale={isSale}
            kind="SERVICE"
            bereichSub={servicesBereichSub}
            bereichDisc={servicesBereichDisc}
            bereichNet={servicesBereichNet}
            bereichDiscountPercent={snapshot.project.servicesDiscountPercent}
            bereichLabel="Zwischensumme Personal & Transport"
            bereichDiscLabel="Personal-&-Transport-Rabatt"
          />
        )}

      {/* Hinweistext */}
      {notes && notes.trim() && (
        <p className="whitespace-pre-line text-sm text-muted-foreground border-t pt-4">
          {notes}
        </p>
      )}

      {/* Totals */}
      <Card>
        <CardContent className="py-4 space-y-1.5 text-sm">
          {projectDiscount > 0 && (
            <Row
              label={`Projekt-Rabatt ${snapshot.project.discountPercent}%`}
              value={`-${formatCurrency(projectDiscount)}`}
              muted
            />
          )}
          <Row label="Gesamt netto" value={formatCurrency(totalNet)} bold />
          {snapshot.settings.vatPercent > 0 && (
            <>
              <Row
                label={`zzgl. MwSt. ${snapshot.settings.vatPercent}%`}
                value={formatCurrency(vatAmount)}
                muted
              />
              <Row
                label="Gesamt brutto"
                value={formatCurrency(totalGross)}
                bold
                large
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Outro-Text */}
      {snapshot.settings.quoteOutroText && (
        <p className="whitespace-pre-line text-sm text-muted-foreground">
          {snapshot.settings.quoteOutroText}
        </p>
      )}
    </div>
  );
}

interface SnapshotSectionProps {
  title: string;
  groups: DocumentSnapshot["groups"];
  groupCalc: Map<string, { sub: number; disc: number; net: number }>;
  factor: number;
  isSale: boolean;
  kind: "MATERIAL" | "SERVICE";
  bereichSub: number;
  bereichDisc: number;
  bereichNet: number;
  bereichDiscountPercent: number;
  bereichLabel: string;
  bereichDiscLabel: string;
}

function SnapshotSection({
  title,
  groups,
  groupCalc,
  factor,
  isSale,
  kind,
  bereichSub,
  bereichDisc,
  bereichNet,
  bereichDiscountPercent,
  bereichLabel,
  bereichDiscLabel,
}: SnapshotSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.map((g) => {
          const info = groupCalc.get(g.id);
          if (!info) return null;
          const hasContent =
            kind === "MATERIAL"
              ? g.materialRows.length > 0 ||
                g.adHocRows.length > 0 ||
                g.comments.length > 0
              : g.serviceRows.length > 0 || g.comments.length > 0;
          if (!hasContent) return null;

          // Items + Comments nach sortOrder mischen
          type Item =
            | {
                kind: "DEVICE";
                sortOrder: number;
                row: DocumentSnapshot["groups"][number]["materialRows"][number];
              }
            | {
                kind: "ADHOC";
                sortOrder: number;
                row: DocumentSnapshot["groups"][number]["adHocRows"][number];
              }
            | {
                kind: "SERVICE";
                sortOrder: number;
                row: DocumentSnapshot["groups"][number]["serviceRows"][number];
              }
            | { kind: "COMMENT"; sortOrder: number; text: string };
          const items: Item[] = [];
          if (kind === "MATERIAL") {
            g.materialRows.forEach((r) =>
              items.push({ kind: "DEVICE", sortOrder: r.sortOrder, row: r }),
            );
            g.adHocRows.forEach((r) =>
              items.push({ kind: "ADHOC", sortOrder: r.sortOrder, row: r }),
            );
          } else {
            g.serviceRows.forEach((r) =>
              items.push({ kind: "SERVICE", sortOrder: r.sortOrder, row: r }),
            );
          }
          g.comments.forEach((c) =>
            items.push({ kind: "COMMENT", sortOrder: c.sortOrder, text: c.text }),
          );
          items.sort((a, b) => a.sortOrder - b.sortOrder);

          return (
            <div key={g.id} className="space-y-1">
              <div className="font-semibold text-sm">{g.name}</div>
              <ul className="space-y-0.5 text-sm">
                {items.map((item, idx) => {
                  if (item.kind === "COMMENT") {
                    return (
                      <li key={idx} className="pt-2 text-sm font-medium text-foreground">
                        {item.text}
                      </li>
                    );
                  }
                  if (item.kind === "DEVICE") {
                    const r = item.row;
                    const line = r.dailyRate * r.quantity * factor;
                    const { name, make } = deviceRowLabel(r);
                    return (
                      <li
                        key={idx}
                        className="flex items-baseline gap-3 border-b border-dashed border-muted py-1"
                      >
                        <span className="w-10 shrink-0 num text-right text-muted-foreground">
                          {r.quantity}×
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="font-medium">{name}</span>
                          {make && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {make}
                            </span>
                          )}
                          {r.description && (
                            <span className="block text-xs text-muted-foreground">
                              {r.description}
                            </span>
                          )}
                        </span>
                        <span className="num text-xs">
                          {formatCurrency(line)}
                        </span>
                      </li>
                    );
                  }
                  if (item.kind === "ADHOC") {
                    const r = item.row;
                    const line = r.unitPrice * r.quantity * factor;
                    return (
                      <li
                        key={idx}
                        className="flex items-baseline gap-3 border-b border-dashed border-muted py-1"
                      >
                        <span className="w-10 shrink-0 num text-right text-muted-foreground">
                          {r.quantity}×
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="font-medium">{r.name}</span>
                          {r.description && (
                            <span className="block text-xs text-muted-foreground">
                              {r.description}
                            </span>
                          )}
                        </span>
                        <span className="num text-xs">
                          {formatCurrency(line)}
                        </span>
                      </li>
                    );
                  }
                  // SERVICE
                  const r = item.row;
                  const line = r.quantity * r.price;
                  return (
                    <li
                      key={idx}
                      className="flex items-baseline gap-3 border-b border-dashed border-muted py-1"
                    >
                      <span className="w-10 shrink-0 num text-right text-muted-foreground">
                        {r.quantity}×
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="font-medium">{r.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {r.unit}
                        </span>
                      </span>
                      <span className="num text-xs">
                        {formatCurrency(line)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="flex justify-end pt-1 text-sm">
                <span className="text-muted-foreground mr-3">
                  Zwischensumme {g.name}
                </span>
                <span className="num-strong">
                  {formatCurrency(info.sub)}
                </span>
              </div>
              {info.disc > 0 && (
                <div className="flex justify-end text-xs text-muted-foreground">
                  <span className="mr-3">Rabatt {g.discountPercent}%</span>
                  <span className="num">
                    -{formatCurrency(info.disc)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
        {bereichDiscountPercent > 0 && (
          <div className="flex justify-end border-t pt-2 text-xs text-muted-foreground">
            <span className="mr-3">
              {bereichDiscLabel} {bereichDiscountPercent}%
            </span>
            <span className="num">
              -{formatCurrency(bereichDisc)}
            </span>
          </div>
        )}
        <div className="flex justify-end border-t pt-2 text-sm font-semibold">
          <span className="mr-3">{bereichLabel}</span>
          <span className="num">
            {formatCurrency(bereichNet)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
  large,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  large?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${large ? "text-base" : ""} ${
        bold ? "font-semibold" : ""
      } ${muted ? "text-muted-foreground" : ""}`}
    >
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}
