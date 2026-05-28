import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await props.params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      assignments: {
        include: {
          packUnit: {
            include: {
              location: true,
              items: { include: { device: { include: { category: true } } } },
            },
          },
        },
        orderBy: { packUnit: { code: "asc" } },
      },
    },
  });
  if (!project) return new NextResponse("Not found", { status: 404 });

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFontSize(20);
  doc.text("Packliste", 14, 20);
  doc.setFontSize(10);
  doc.text(`Projekt: ${project.name}`, 14, 28);
  if (project.customer) doc.text(`Kunde: ${project.customer}`, 14, 33);
  doc.text(
    `Planung: ${project.planningStart.toLocaleDateString("de-DE")} – ${project.planningEnd.toLocaleDateString("de-DE")}`,
    14,
    38
  );

  let startY = 48;

  for (const a of project.assignments) {
    const pu = a.packUnit;
    const title = `${pu.code} — ${pu.name}${a.quantity > 1 ? ` (× ${a.quantity})` : ""}`;
    const totalDevices = pu.items.reduce((s, it) => s + it.quantity, 0) * a.quantity;
    const sub = `${pu.items.length} Geräte-Typen, ${totalDevices} Stück${pu.location ? ` · ${pu.location.name}` : ""}`;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(title, 14, startY);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110);
    doc.text(sub, 14, startY + 4);
    doc.setTextColor(0);

    autoTable(doc, {
      startY: startY + 6,
      head: [["Bezeichnung", "Hersteller / Modell", "Pro Case", "Gesamt", "Gewicht/Stück"]],
      body: pu.items.map((it) => [
        it.device.name,
        [it.device.manufacturer, it.device.model].filter(Boolean).join(" ") || "—",
        `× ${it.quantity}`,
        String(it.quantity * a.quantity),
        it.device.weight ? `${it.device.weight} kg` : "—",
      ]),
      theme: "striped",
      styles: { fontSize: 9 },
      headStyles: { fillColor: [60, 60, 60] },
    });
    // @ts-expect-error: lastAutoTable
    startY = doc.lastAutoTable.finalY + 8;

    if (startY > 260) {
      doc.addPage();
      startY = 20;
    }
  }

  // Summen
  const totalPackUnits = project.assignments.reduce((s, a) => s + a.quantity, 0);
  const totalDevices = project.assignments.reduce(
    (s, a) => s + a.packUnit.items.reduce((ds, it) => ds + it.quantity, 0) * a.quantity,
    0
  );
  const totalWeight = project.assignments.reduce((s, a) => {
    const puWeight = Number(a.packUnit.weight ?? 0);
    const devicesWeight = a.packUnit.items.reduce(
      (ds, it) => ds + Number(it.device.weight ?? 0) * it.quantity,
      0
    );
    return s + (puWeight + devicesWeight) * a.quantity;
  }, 0);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(
    `Summe: ${totalPackUnits} Packeinheiten | ${totalDevices} Geräte | ${totalWeight.toFixed(1)} kg`,
    14,
    startY
  );

  const blob = doc.output("arraybuffer");
  return new NextResponse(blob, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="packliste-${project.name.replace(/\s+/g, "_")}.pdf"`,
    },
  });
}
