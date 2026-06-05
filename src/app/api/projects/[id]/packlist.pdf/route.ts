import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { buildPackList } from "@/lib/packlist";
import { buildProjectPdfFilename } from "@/lib/utils";

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
          device: { include: { category: true } },
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
      category: true,
      items: { include: { device: true } },
    },
    orderBy: [{ packMode: "asc" }, { code: "asc" }],
  });

  // Alle Kategorien für Pfad-Auflösung (Hierarchie)
  const allCategories = await prisma.category.findMany();
  const categoryById = new Map(allCategories.map((c) => [c.id, c]));

  function categoryPath(categoryId: string | null): {
    key: string;
    label: string;
    sortKey: string;
  } {
    if (!categoryId) {
      return { key: "_none", label: "Ohne Kategorie", sortKey: "￿" };
    }
    const segments: string[] = [];
    let cur = categoryById.get(categoryId);
    let safety = 20;
    while (cur && safety-- > 0) {
      segments.unshift(cur.name);
      cur = cur.parentId ? categoryById.get(cur.parentId) : undefined;
    }
    const label = segments.join(" / ");
    return { key: categoryId, label, sortKey: label.toLowerCase() };
  }

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

  const packs = packList.filter((p): p is Extract<typeof p, { kind: "PACK" }> => p.kind === "PACK");
  const loose = packList.filter((p): p is Extract<typeof p, { kind: "LOOSE" }> => p.kind === "LOOSE");

  // Gruppierung nach Kategorie
  type CategoryGroup = {
    key: string;
    label: string;
    sortKey: string;
    packs: typeof packs;
    loose: typeof loose;
  };
  const groups = new Map<string, CategoryGroup>();
  function ensureGroup(categoryId: string | null): CategoryGroup {
    const info = categoryPath(categoryId);
    const existing = groups.get(info.key);
    if (existing) return existing;
    const g: CategoryGroup = {
      key: info.key,
      label: info.label,
      sortKey: info.sortKey,
      packs: [],
      loose: [],
    };
    groups.set(info.key, g);
    return g;
  }

  for (const p of packs) {
    const pu = candidatePackUnits.find((c) => c.id === p.packUnitId);
    ensureGroup(pu?.categoryId ?? null).packs.push(p);
  }
  for (const l of loose) {
    const a = project.assignments.find((x) => x.deviceId === l.deviceId);
    ensureGroup(a?.device.categoryId ?? null).loose.push(l);
  }

  const sortedGroups = Array.from(groups.values()).sort((a, b) =>
    a.sortKey.localeCompare(b.sortKey, "de")
  );

  type CellDef =
    | string
    | { content: string; colSpan?: number; styles?: Record<string, unknown> };
  const body: CellDef[][] = [];

  // Kategorie-Section: dunkler Streifen, Text in Bezeichnungs-Spalte
  const sectionRow = (label: string): CellDef[] => [
    {
      content: "",
      styles: {
        fillColor: [60, 60, 60] as [number, number, number],
        cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      },
    },
    {
      content: label,
      colSpan: 2,
      styles: {
        fillColor: [60, 60, 60] as [number, number, number],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 10,
        cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      },
    },
  ];

  // Sub-Section („Packeinheiten" / „Lose Geräte"): hellgrau, kleiner
  const subSectionRow = (label: string): CellDef[] => [
    {
      content: "",
      styles: {
        fillColor: [235, 235, 235] as [number, number, number],
        cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 },
      },
    },
    {
      content: label,
      colSpan: 2,
      styles: {
        fillColor: [235, 235, 235] as [number, number, number],
        textColor: 90,
        fontStyle: "bold",
        fontSize: 8,
        cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 },
      },
    },
  ];

  for (const g of sortedGroups) {
    body.push(sectionRow(g.label));

    if (g.packs.length > 0) body.push(subSectionRow("Packeinheiten"));
    for (const p of g.packs) {
      const mode = p.mode === "FIXED" ? "Fix" : "Variabel";
      const loc = p.locationName ? ` · ${p.locationName}` : "";
      body.push([
        {
          content: `${p.quantity}×`,
          styles: { fontStyle: "bold", halign: "left" },
        },
        {
          content: `${p.name}  (${mode}${loc})`,
          styles: { fontStyle: "bold" },
        },
        {
          content: p.weightPerUnit
            ? `${(p.weightPerUnit * p.quantity).toFixed(1)} kg`
            : "—",
          styles: { halign: "right" },
        },
      ]);
      for (const c of p.contents) {
        body.push([
          {
            content: `${c.perUnit}×  (= ${c.total})`,
            styles: {
              textColor: 130,
              fontSize: 8,
              halign: "left",
              // extra Padding links → Inhalts-Anzahl rutscht vom linken Rand
              // nach innen und steht damit eingerückt unter der Pack-Anzahl.
              cellPadding: { top: 1.5, bottom: 1.5, left: 8, right: 3 },
            },
          },
          {
            content: `        ${c.deviceName}`,
            styles: { textColor: 130, fontSize: 8 },
          },
          { content: "", styles: { textColor: 130, fontSize: 8 } },
        ]);
      }
    }

    if (g.loose.length > 0) body.push(subSectionRow("Lose Geräte"));
    for (const l of g.loose) {
      body.push([
        { content: `${l.quantity}×`, styles: { halign: "left" } },
        l.deviceName,
        {
          content: l.weightPerUnit
            ? `${(l.weightPerUnit * l.quantity).toFixed(1)} kg`
            : "—",
          styles: { halign: "right" },
        },
      ]);
    }
  }

  autoTable(doc, {
    startY: 48,
    head: [["Anzahl", "Bezeichnung", "Gewicht"]],
    body,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 } },
    headStyles: {
      fillColor: [40, 40, 40] as [number, number, number],
      textColor: 255,
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 28, halign: "left" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 28, halign: "right" },
    },
  });

  // @ts-expect-error: lastAutoTable
  const finalY: number = doc.lastAutoTable.finalY;

  // Summen
  const totalPacks = packs.reduce((s, p) => s + p.quantity, 0);
  const totalDevices = packList.reduce((s, p) => {
    if (p.kind === "PACK") return s + p.contents.reduce((cs, c) => cs + c.total, 0);
    return s + p.quantity;
  }, 0);
  const totalWeight = packList.reduce(
    (s, p) => s + p.weightPerUnit * p.quantity,
    0
  );

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(
    `Summe: ${totalPacks} Packeinheiten | ${totalDevices} Geräte | ${totalWeight.toFixed(1)} kg`,
    14,
    finalY + 8
  );

  const blob = doc.output("arraybuffer");
  const filename = buildProjectPdfFilename(
    "Packliste",
    project.customer?.name ?? null,
    project.name
  );
  return new NextResponse(blob, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
