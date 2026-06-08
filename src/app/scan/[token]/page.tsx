import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { buildPackList } from "@/lib/packlist";
import { ScanClient } from "./scan-client";

export const dynamic = "force-dynamic";

export default async function PublicScanPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;

  const project = await prisma.project.findFirst({
    where: { packToken: token },
    include: {
      customer: { select: { name: true } },
      assignments: {
        include: { device: { include: { category: true } } },
      },
      packingScans: {
        orderBy: { scannedAt: "desc" },
        include: {
          packUnit: { select: { id: true, code: true, name: true } },
          device: { select: { id: true, name: true } },
          deviceSerial: { select: { serialNumber: true } },
        },
      },
    },
  });

  if (!project) notFound();

  // PackUnits, die mindestens ein gebuchtes Gerät enthalten
  const bookedDeviceIds = project.assignments.map((a) => a.deviceId);
  const projectPackUnits =
    bookedDeviceIds.length > 0
      ? await prisma.packUnit.findMany({
          where: { items: { some: { deviceId: { in: bookedDeviceIds } } } },
          include: {
            location: true,
            category: true,
            items: { include: { device: true } },
          },
        })
      : [];

  const allCategories = await prisma.category.findMany({
    select: { id: true, name: true, parentId: true },
  });

  const packList = buildPackList(
    project.assignments.map((a) => ({
      deviceId: a.deviceId,
      quantity: a.quantity,
      device: a.device,
    })),
    projectPackUnits
  );

  // Pro Packlisten-Item den Ist-Stand aus den Scans aggregieren
  const scansByPackUnit = new Map<string, number>();
  const scansByDevice = new Map<string, number>();
  for (const s of project.packingScans) {
    if (s.packUnitId) {
      scansByPackUnit.set(s.packUnitId, (scansByPackUnit.get(s.packUnitId) ?? 0) + 1);
    } else if (s.deviceId) {
      scansByDevice.set(s.deviceId, (scansByDevice.get(s.deviceId) ?? 0) + 1);
    }
  }

  // categoryId pro PackUnit / Device — wird für die hierarchische Gruppierung
  // in der UI gebraucht.
  const packUnitCategory = new Map<string, string | null>();
  for (const pu of projectPackUnits) {
    packUnitCategory.set(pu.id, pu.categoryId ?? null);
  }
  const deviceCategory = new Map<string, string | null>();
  for (const a of project.assignments) {
    deviceCategory.set(a.deviceId, a.device.categoryId ?? null);
  }

  const items = packList.map((it) => {
    if (it.kind === "PACK") {
      return {
        kind: "PACK" as const,
        key: `pack:${it.packUnitId}`,
        packUnitId: it.packUnitId,
        code: it.code,
        name: it.name,
        required: it.quantity,
        scanned: Math.min(scansByPackUnit.get(it.packUnitId) ?? 0, it.quantity),
        scannedRaw: scansByPackUnit.get(it.packUnitId) ?? 0,
        categoryId: packUnitCategory.get(it.packUnitId) ?? null,
      };
    }
    return {
      kind: "LOOSE" as const,
      key: `loose:${it.deviceId}`,
      deviceId: it.deviceId,
      name: it.deviceName,
      required: it.quantity,
      scanned: Math.min(scansByDevice.get(it.deviceId) ?? 0, it.quantity),
      scannedRaw: scansByDevice.get(it.deviceId) ?? 0,
      categoryId: deviceCategory.get(it.deviceId) ?? null,
    };
  });

  const recentScans = project.packingScans.slice(0, 25).map((s) => ({
    id: s.id,
    scannedAt: s.scannedAt.toISOString(),
    scannedCode: s.scannedCode,
    label: s.packUnit
      ? `${s.packUnit.code} · ${s.packUnit.name}`
      : s.device
        ? `${s.device.name}${s.deviceSerial ? " · " + s.deviceSerial.serialNumber : ""}`
        : "(unbekannt)",
    kind: s.packUnit ? ("PACK_UNIT" as const) : ("DEVICE" as const),
  }));

  return (
    <ScanClient
      token={token}
      projectName={project.name}
      customerName={project.customer?.name ?? null}
      items={items}
      categories={allCategories}
      recentScans={recentScans}
    />
  );
}
