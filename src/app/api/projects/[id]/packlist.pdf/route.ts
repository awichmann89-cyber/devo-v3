import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { buildPackList } from "@/lib/packlist";

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await props.params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      customer: true,
      assignments: {
        include: {
          device: true,
        },
      },
    },
  });
  if (!project) return new NextResponse("Not found", { status: 404 });

  // Alle PackUnits laden, die mindestens eines der gebuchten Geräte enthalten
  const bookedDeviceIds = project.assignments.map((a) => a.deviceId);
  const candidatePackUnits = await prisma.packUnit.findMany({
    where: {
      items: { some: { deviceId: { in: bookedDeviceIds } } },
    },
    include: {
      location: true,
      items: { include: { device: true } },
    },
    orderBy: [{ packMode: "asc" }, { code: "asc" }],
  });

  const packList = buildPackList(
    project.assignments.map((a) => ({
      deviceId: a.deviceId,
      quantity: a.quantity,
      device: { name: a.device.name, weight: a.device.weight },
    })),
    candidatePackUnits.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      packMode: p.packMode,
      stockQuantity: p.stockQuantity,
      weight: p.weight,
      location: p.location ? { name: p.location.name } : null,
      items: p.items.map((it) => ({
        deviceId: it.deviceId,
        quantity: it.quantity,
        device: { name: it.device.name },
      })),
    }))
  );

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFontSize(20);
  doc.text("Packliste", 14, 20);
  doc.setFontSize(10);
  doc.text(`Projekt: ${project.name}`, 14, 28);
  if (project.customer) doc.text(`Kunde: ${project.customer.name}`, 14, 33);
  doc.text(
    `Planung: ${project.planningStart.toLocaleDateString("de-DE")} – ${project.planningEnd.toLocaleDateString("de-DE")}`,
    14,
    38
  );

  let startY = 48;

  const packs = packList.filter((p) => p.kind === "PACK");
  const loose = packList.filter((p) => p.kind === "LOOSE");

  for (const p of packs) {
    if (p.kind !== "PACK") continue;
    const title = `${p.code} — ${p.name}${p.quantity > 1 ? ` (× ${p.quantity})` : ""}`;
    const sub = `${p.mode === "FIXED" ? "Fix" : "Variabel"}${p.locationName ? ` · ${p.locationName}` : ""}`;

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
      head: [["Bezeichnung", "Pro Case", "Gesamt"]],
      body: p.contents.map((c) => [c.deviceName, `× ${c.perUnit}`, String(c.total)]),
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

  // Lose Items
  if (loose.length > 0) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Lose Geräte (ohne Case)", 14, startY);
    doc.setFont("helvetica", "normal");
    autoTable(doc, {
      startY: startY + 4,
      head: [["Bezeichnung", "Anzahl", "Gewicht/Stück"]],
      body: loose.map((l) =>
        l.kind === "LOOSE"
          ? [l.deviceName, String(l.quantity), l.weightPerUnit ? `${l.weightPerUnit} kg` : "—"]
          : ["", "", ""]
      ),
      theme: "striped",
      styles: { fontSize: 9 },
      headStyles: { fillColor: [60, 60, 60] },
    });
    // @ts-expect-error: lastAutoTable
    startY = doc.lastAutoTable.finalY + 8;
  }

  // Summen
  const totalPacks = packs.reduce((s, p) => (p.kind === "PACK" ? s + p.quantity : s), 0);
  const totalDevices = packList.reduce((s, p) => {
    if (p.kind === "PACK") return s + p.contents.reduce((cs, c) => cs + c.total, 0);
    return s + p.quantity;
  }, 0);
  const totalWeight = packList.reduce((s, p) => {
    if (p.kind === "PACK") return s + p.weightPerUnit * p.quantity;
    return s + p.weightPerUnit * p.quantity;
  }, 0);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(
    `Summe: ${totalPacks} Packeinheiten | ${totalDevices} Geräte | ${totalWeight.toFixed(1)} kg`,
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
