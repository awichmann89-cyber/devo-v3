import { prisma } from "@/lib/prisma";
import { ProjectStatus } from "@prisma/client";
import { buildPackList } from "@/lib/packlist";

/**
 * Prüft, ob die gegebenen Geräte im Zeitraum schon (über-) gebucht sind.
 *
 * Liefert eine Liste der konfligierenden Projekt-Assignments
 * (mit Projekt-Infos), ohne den Verfügbarkeits-Vergleich mit stockQuantity zu
 * machen — das ist Sache des Aufrufers (siehe `getOverlappingAssignments`).
 */
export async function findConflicts(
  deviceIds: string[],
  start: Date,
  end: Date,
  excludeProjectId?: string
) {
  if (deviceIds.length === 0) return [];

  const blockingStatuses: ProjectStatus[] = [
    ProjectStatus.DRAFT,
    ProjectStatus.CONFIRMED,
    ProjectStatus.ACTIVE,
  ];

  return prisma.projectAssignment.findMany({
    where: {
      deviceId: { in: deviceIds },
      projectId: excludeProjectId ? { not: excludeProjectId } : undefined,
      project: {
        status: { in: blockingStatuses },
        planningStart: { lte: end },
        planningEnd: { gte: start },
      },
    },
    include: {
      project: {
        select: { id: true, name: true, status: true, planningStart: true, planningEnd: true },
      },
      device: { select: { id: true, name: true, stockQuantity: true } },
    },
  });
}

/**
 * Liefert für jedes Gerät alle überlappenden Buchungen (inkl. eigenes Projekt),
 * mit Quantity pro Buchung — zur Berechnung von Über-Bestand.
 *
 * Zusätzlich wird je Buchung `effectiveQuantity` berechnet: das ist die Stückzahl,
 * die das Projekt durch die FIXED-Packeinheiten-Logik tatsächlich physisch
 * blockiert. Beispiel: 1 Lautsprecher gebucht, aber FIXED Doppelcase enthält 2
 * → effectiveQuantity = 2.
 */
export async function getOverlappingAssignments(
  deviceIds: string[],
  start: Date,
  end: Date
) {
  if (deviceIds.length === 0) return [];

  const blockingStatuses: ProjectStatus[] = [
    ProjectStatus.DRAFT,
    ProjectStatus.CONFIRMED,
    ProjectStatus.ACTIVE,
  ];

  const direct = await prisma.projectAssignment.findMany({
    where: {
      deviceId: { in: deviceIds },
      project: {
        status: { in: blockingStatuses },
        planningStart: { lte: end },
        planningEnd: { gte: start },
      },
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          status: true,
          planningStart: true,
          planningEnd: true,
          confirmedAt: true,
        },
      },
    },
  });

  if (direct.length === 0) return [];

  // Für jedes betroffene Projekt: alle Buchungen + alle relevanten PackUnits laden,
  // Packliste rechnen und den effektiven physischen Bedarf pro Gerät bestimmen.
  const projectIds = Array.from(new Set(direct.map((d) => d.projectId)));

  const projectsWithAssignments = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: {
      id: true,
      assignments: {
        select: {
          deviceId: true,
          quantity: true,
          device: { select: { id: true, name: true, weight: true } },
        },
      },
    },
  });

  const everyDeviceId = new Set<string>();
  for (const p of projectsWithAssignments) {
    for (const a of p.assignments) everyDeviceId.add(a.deviceId);
  }

  const packUnits =
    everyDeviceId.size > 0
      ? await prisma.packUnit.findMany({
          where: {
            items: { some: { deviceId: { in: Array.from(everyDeviceId) } } },
          },
          include: {
            location: true,
            items: { include: { device: { select: { id: true, name: true } } } },
          },
        })
      : [];

  type BlockingPack = {
    code: string;
    name: string;
    perUnit: number;
    /** Anzahl der Cases dieser Packeinheit, die in dem Projekt allokiert sind */
    useCount: number;
    /** Lagerbestand der Packeinheit (Anzahl physisch identischer Cases) */
    packStockQuantity: number;
  };
  const effectivePerProject = new Map<string, Map<string, number>>();
  const packsPerProject = new Map<string, Map<string, BlockingPack[]>>();
  const packStockById = new Map(packUnits.map((pu) => [pu.id, pu.stockQuantity]));

  for (const p of projectsWithAssignments) {
    const list = buildPackList(
      p.assignments.map((a) => ({
        deviceId: a.deviceId,
        quantity: a.quantity,
        device: { name: a.device.name, weight: a.device.weight },
      })),
      packUnits.map((pu) => ({
        id: pu.id,
        code: pu.code,
        name: pu.name,
        packMode: pu.packMode,
        weight: pu.weight,
        location: pu.location ? { name: pu.location.name } : null,
        items: pu.items.map((it) => ({
          deviceId: it.deviceId,
          quantity: it.quantity,
          device: { name: it.device.name },
        })),
      }))
    );

    const byDevice = new Map<string, number>();
    const blockingByDevice = new Map<string, BlockingPack[]>();
    for (const item of list) {
      if (item.kind === "PACK") {
        for (const c of item.contents) {
          byDevice.set(c.deviceId, (byDevice.get(c.deviceId) ?? 0) + c.total);
          // Nur FIXED-Packs sind „echte" Konflikt-Treiber (Überbuchung kann
          // sonst auch ohne Pack-Bezug entstehen). VARIABLE-Packs überschießen
          // den Bedarf nicht und sind daher nicht der Konflikt-Grund.
          if (item.mode === "FIXED") {
            const arr = blockingByDevice.get(c.deviceId) ?? [];
            arr.push({
              code: item.code,
              name: item.name,
              perUnit: c.perUnit,
              useCount: item.quantity,
              packStockQuantity: packStockById.get(item.packUnitId) ?? 0,
            });
            blockingByDevice.set(c.deviceId, arr);
          }
        }
      } else {
        byDevice.set(item.deviceId, (byDevice.get(item.deviceId) ?? 0) + item.quantity);
      }
    }
    // Sicherheits-Floor: effective darf nie unter booked liegen
    // (z.B. wenn ein Gerät gar nicht in einem PackUnit ist).
    for (const a of p.assignments) {
      const eff = byDevice.get(a.deviceId) ?? 0;
      if (eff < a.quantity) byDevice.set(a.deviceId, a.quantity);
    }
    effectivePerProject.set(p.id, byDevice);
    packsPerProject.set(p.id, blockingByDevice);
  }

  // Reservierungs-FIFO pro Gerät: Bestand des Geräts wird in der Reihenfolge
  // ACTIVE → CONFIRMED (nach confirmedAt ↑) an Projekte vergeben. DRAFT-Projekte
  // sind nie reserviert. Wer mit seinem effectiveQuantity in den verbleibenden
  // Bestand passt, ist reserviert; alle danach laufen ins Konflikt-Warning.
  const deviceStocks = await prisma.device.findMany({
    where: { id: { in: deviceIds } },
    select: { id: true, stockQuantity: true },
  });
  const stockById = new Map(deviceStocks.map((d) => [d.id, d.stockQuantity]));

  // Pro Device alle Overlaps gruppieren
  const byDeviceOverlaps = new Map<string, typeof direct>();
  for (const d of direct) {
    const arr = byDeviceOverlaps.get(d.deviceId) ?? [];
    arr.push(d);
    byDeviceOverlaps.set(d.deviceId, arr);
  }

  const reservedAssignmentIds = new Set<string>();
  function statusRank(status: ProjectStatus): number {
    if (status === ProjectStatus.ACTIVE) return 0;
    if (status === ProjectStatus.CONFIRMED) return 1;
    return 2; // DRAFT
  }
  for (const [deviceId, overlaps] of byDeviceOverlaps) {
    const stock = stockById.get(deviceId) ?? 0;
    const sorted = [...overlaps].sort((a, b) => {
      const ra = statusRank(a.project.status);
      const rb = statusRank(b.project.status);
      if (ra !== rb) return ra - rb;
      const ca = a.project.confirmedAt?.getTime() ?? Number.POSITIVE_INFINITY;
      const cb = b.project.confirmedAt?.getTime() ?? Number.POSITIVE_INFINITY;
      return ca - cb;
    });
    let used = 0;
    for (const o of sorted) {
      if (o.project.status === ProjectStatus.DRAFT) continue; // DRAFT nie reservieren
      const eff =
        effectivePerProject.get(o.projectId)?.get(o.deviceId) ?? o.quantity;
      if (used + eff <= stock) {
        reservedAssignmentIds.add(o.id);
        used += eff;
      }
      // sonst: dieses Projekt verliert die Reservierung, used bleibt
    }
  }

  return direct.map((d) => ({
    ...d,
    effectiveQuantity:
      effectivePerProject.get(d.projectId)?.get(d.deviceId) ?? d.quantity,
    blockingPackUnits:
      packsPerProject.get(d.projectId)?.get(d.deviceId) ?? [],
    isReserved: reservedAssignmentIds.has(d.id),
  }));
}
