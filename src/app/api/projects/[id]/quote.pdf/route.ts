import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { daysBetween } from "@/lib/utils";
import { billingUnitLabel, serviceItemKindLabel } from "@/lib/labels";

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await props.params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      customer: true,
      billingPeriods: { orderBy: { start: "asc" } },
      groups: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] },
      assignments: {
        include: {
          packUnit: { include: { items: { include: { device: true } } } },
        },
      },
      services: {
        include: { serviceItem: true },
      },
    },
  });
  if (!project) return new NextResponse("Not found", { status: 404 });

  const days = project.billingPeriods.reduce(
    (sum, p) => sum + daysBetween(p.start, p.end),
    0
  );

  // Material aggregieren PRO GRUPPE
  type MaterialRow = {
    name: string;
    manufacturer: string | null;
    model: string | null;
    dailyRate: number;
    quantity: number;
  };
  const materialGroups = project.groups.filter((g) => g.kind === "MATERIAL");
  const serviceGroups = project.groups.filter((g) => g.kind === "SERVICE");

  // Map: groupId -> aggregierte Geräte-Rows
  const materialByGroup = new Map<string, MaterialRow[]>();
  for (const a of project.assignments) {
    const groupMap =
      materialByGroup.get(a.groupId) ?? ([] as MaterialRow[]);
    // Devices innerhalb der Gruppe aggregieren
    const lookup = new Map<string, MaterialRow>();
    for (const r of groupMap) {
      lookup.set(`${r.name}|${r.manufacturer}|${r.model}|${r.dailyRate}`, r);
    }
    for (const it of a.packUnit.items) {
      const qty = a.quantity * it.quantity;
      const key = `${it.device.name}|${it.device.manufacturer}|${it.device.model}|${Number(it.device.dailyRate)}`;
      const existing = lookup.get(key);
      if (existing) {
        existing.quantity += qty;
      } else {
        const row: MaterialRow = {
          name: it.device.name,
          manufacturer: it.device.manufacturer,
          model: it.device.model,
          dailyRate: Number(it.device.dailyRate),
          quantity: qty,
        };
        lookup.set(key, row);
        groupMap.push(row);
      }
    }
    materialByGroup.set(a.groupId, groupMap);
  }
  // Sort each group's rows alphabetically
  for (const arr of materialByGroup.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name, "de"));
  }

  // Materialsumme über alle Gruppen
  const materialSubtotal = Array.from(materialByGroup.values()).reduce(
    (s, rows) =>
      s + rows.reduce((sr, r) => sr + r.dailyRate * r.quantity * days, 0),
    0
  );

  // Services pro Gruppe sammeln
  const servicesByGroup = new Map<
    string,
    { name: string; kind: string; unit: string; quantity: number; price: number }[]
  >();
  for (const ps of project.services) {
    const arr = servicesByGroup.get(ps.groupId) ?? [];
    arr.push({
      name: ps.serviceItem.name,
      kind: serviceItemKindLabel(ps.serviceItem.kind),
      unit: billingUnitLabel(ps.serviceItem.unit),
      quantity: Number(ps.quantity),
      price: ps.unitPriceOverride
        ? Number(ps.unitPriceOverride)
        : Number(ps.serviceItem.unitPrice),
    });
    servicesByGroup.set(ps.groupId, arr);
  }
  for (const arr of servicesByGroup.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name, "de"));
  }

  const servicesSubtotal = Array.from(servicesByGroup.values()).reduce(
    (s, items) => s + items.reduce((si, r) => si + r.quantity * r.price, 0),
    0
  );

  const subtotal = materialSubtotal + servicesSubtotal;
  const discount = (subtotal * Number(project.discountPercent)) / 100;
  const total = subtotal - discount;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFontSize(20);
  doc.text("Mietangebot", 14, 20);
  doc.setFontSize(10);
  doc.text(`Projekt: ${project.name}`, 14, 28);
  if (project.customer) doc.text(`Kunde: ${project.customer.name}`, 14, 33);
  const periodsText =
    project.billingPeriods.length === 1
      ? `${project.billingPeriods[0].start.toLocaleDateString("de-DE")} – ${project.billingPeriods[0].end.toLocaleDateString("de-DE")}`
      : project.billingPeriods
          .map(
            (p, i) =>
              `${i + 1}. ${p.start.toLocaleDateString("de-DE")} – ${p.end.toLocaleDateString("de-DE")}`
          )
          .join(" | ");
  doc.text(`Mietzeitraum: ${periodsText} (${days} Tage)`, 14, 38);

  let currentY = 45;

  function setBold(b: boolean) {
    doc.setFont(undefined as unknown as string, b ? "bold" : "normal");
  }

  // ===== Material-Sektion =====
  const hasMaterial = project.assignments.length > 0;
  if (hasMaterial) {
    doc.setFontSize(12);
    setBold(true);
    doc.text("Material", 14, currentY);
    setBold(false);
    currentY += 5;

    for (const group of materialGroups) {
      const rows = materialByGroup.get(group.id) ?? [];
      if (rows.length === 0) continue;

      // Group heading
      doc.setFontSize(10);
      setBold(true);
      doc.text(group.name, 14, currentY);
      setBold(false);

      const groupSum = rows.reduce(
        (s, r) => s + r.dailyRate * r.quantity * days,
        0
      );

      autoTable(doc, {
        startY: currentY + 2,
        head: [
          ["Pos.", "Bezeichnung", "Hersteller / Modell", "Anzahl", "€ / Tag", "Tage", "Summe"],
        ],
        body: rows.map((r, i) => {
          const line = r.dailyRate * r.quantity * days;
          const make = [r.manufacturer, r.model].filter(Boolean).join(" ");
          return [
            String(i + 1),
            r.name,
            make || "—",
            String(r.quantity),
            r.dailyRate.toFixed(2) + " €",
            String(days),
            line.toFixed(2) + " €",
          ];
        }),
        foot: [
          [
            "",
            "",
            "",
            "",
            "",
            `Zwischensumme ${group.name}`,
            groupSum.toFixed(2) + " €",
          ],
        ],
        theme: "striped",
        styles: { fontSize: 9 },
        headStyles: { fillColor: [60, 60, 60] },
        footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold" },
        columnStyles: {
          0: { halign: "right", cellWidth: 12 },
          3: { halign: "right" },
          4: { halign: "right" },
          5: { halign: "right" },
          6: { halign: "right" },
        },
      });
      // @ts-expect-error: lastAutoTable
      currentY = doc.lastAutoTable.finalY + 6;
    }

    // Material-Gesamtsumme über alle Gruppen
    setBold(true);
    doc.setFontSize(10);
    doc.text(`Material gesamt: ${materialSubtotal.toFixed(2)} €`, 14, currentY);
    setBold(false);
    currentY += 8;
  }

  // ===== Services-Sektion =====
  const hasServices = project.services.length > 0;
  if (hasServices) {
    doc.setFontSize(12);
    setBold(true);
    doc.text("Personal & Transport", 14, currentY);
    setBold(false);
    currentY += 5;

    for (const group of serviceGroups) {
      const items = servicesByGroup.get(group.id) ?? [];
      if (items.length === 0) continue;

      doc.setFontSize(10);
      setBold(true);
      doc.text(group.name, 14, currentY);
      setBold(false);

      const groupSum = items.reduce((s, r) => s + r.quantity * r.price, 0);

      autoTable(doc, {
        startY: currentY + 2,
        head: [
          ["Pos.", "Bezeichnung", "Art", "Menge", "Einheit", "€ / Einheit", "Summe"],
        ],
        body: items.map((r, i) => {
          const line = r.quantity * r.price;
          return [
            String(i + 1),
            r.name,
            r.kind,
            r.quantity.toString().replace(".", ","),
            r.unit,
            r.price.toFixed(2) + " €",
            line.toFixed(2) + " €",
          ];
        }),
        foot: [
          [
            "",
            "",
            "",
            "",
            "",
            `Zwischensumme ${group.name}`,
            groupSum.toFixed(2) + " €",
          ],
        ],
        theme: "striped",
        styles: { fontSize: 9 },
        headStyles: { fillColor: [60, 60, 60] },
        footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold" },
        columnStyles: {
          0: { halign: "right", cellWidth: 12 },
          3: { halign: "right" },
          5: { halign: "right" },
          6: { halign: "right" },
        },
      });
      // @ts-expect-error: lastAutoTable
      currentY = doc.lastAutoTable.finalY + 6;
    }

    setBold(true);
    doc.setFontSize(10);
    doc.text(
      `Personal & Transport gesamt: ${servicesSubtotal.toFixed(2)} €`,
      14,
      currentY
    );
    setBold(false);
    currentY += 8;
  }

  // ===== Totals =====
  autoTable(doc, {
    startY: currentY,
    body: [
      ["Zwischensumme", subtotal.toFixed(2) + " €"],
      ...(discount > 0
        ? [
            [
              `Rabatt ${project.discountPercent.toString()}%`,
              "−" + discount.toFixed(2) + " €",
            ],
          ]
        : []),
      ["Gesamt netto", total.toFixed(2) + " €"],
    ],
    theme: "plain",
    styles: { fontSize: 10 },
    columnStyles: {
      0: { halign: "right", cellWidth: 150 },
      1: { halign: "right", fontStyle: "bold" },
    },
    didParseCell: (data) => {
      if (data.row.index === (discount > 0 ? 2 : 1)) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 11;
      }
    },
  });

  // @ts-expect-error: lastAutoTable
  const endY = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(
    "Alle Preise zzgl. MwSt. Angebot gilt vorbehaltlich Verfügbarkeit.",
    14,
    endY
  );

  const blob = doc.output("arraybuffer");
  return new NextResponse(blob, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="angebot-${project.name.replace(/\s+/g, "_")}.pdf"`,
    },
  });
}
