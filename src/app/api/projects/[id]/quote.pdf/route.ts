import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { daysBetween } from "@/lib/utils";

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await props.params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      assignments: {
        include: {
          packUnit: { include: { items: { include: { device: true } } } },
        },
      },
    },
  });
  if (!project) return new NextResponse("Not found", { status: 404 });

  const days = daysBetween(project.billingStart, project.billingEnd);

  // Aggregiere Geräte über alle Packeinheits-Buchungen.
  // Für jeden Eintrag: assignmentQty × itemQty Stück dieses Geräts.
  type Row = {
    deviceId: string;
    name: string;
    manufacturer: string | null;
    model: string | null;
    dailyRate: number;
    quantity: number;
  };
  const map = new Map<string, Row>();
  for (const a of project.assignments) {
    for (const it of a.packUnit.items) {
      const qty = a.quantity * it.quantity;
      const key = it.device.id;
      const prev = map.get(key);
      if (prev) {
        prev.quantity += qty;
      } else {
        map.set(key, {
          deviceId: it.device.id,
          name: it.device.name,
          manufacturer: it.device.manufacturer,
          model: it.device.model,
          dailyRate: Number(it.device.dailyRate),
          quantity: qty,
        });
      }
    }
  }

  const rows = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "de"));

  const subtotal = rows.reduce((s, r) => s + r.dailyRate * r.quantity * days, 0);
  const discount = (subtotal * Number(project.discountPercent)) / 100;
  const total = subtotal - discount;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFontSize(20);
  doc.text("Mietangebot", 14, 20);
  doc.setFontSize(10);
  doc.text(`Projekt: ${project.name}`, 14, 28);
  if (project.customer) doc.text(`Kunde: ${project.customer}`, 14, 33);
  doc.text(
    `Mietzeitraum: ${project.billingStart.toLocaleDateString("de-DE")} – ${project.billingEnd.toLocaleDateString("de-DE")} (${days} Tage)`,
    14,
    38
  );

  autoTable(doc, {
    startY: 45,
    head: [["Pos.", "Bezeichnung", "Hersteller / Modell", "Anzahl", "€ / Tag", "Tage", "Summe"]],
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
      ["", "", "", "", "", "Zwischensumme", subtotal.toFixed(2) + " €"],
      ...(discount > 0
        ? [["", "", "", "", "", `Rabatt ${project.discountPercent.toString()}%`, "−" + discount.toFixed(2) + " €"]]
        : []),
      ["", "", "", "", "", "Gesamt netto", total.toFixed(2) + " €"],
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
  const endY = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text("Alle Preise zzgl. MwSt. Angebot gilt vorbehaltlich Verfügbarkeit.", 14, endY);

  const blob = doc.output("arraybuffer");
  return new NextResponse(blob, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="angebot-${project.name.replace(/\s+/g, "_")}.pdf"`,
    },
  });
}
