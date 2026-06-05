import { Prisma } from "@prisma/client";

/**
 * Eine PackUnit (Case) wird auf der Packliste als Eintrag aufgeführt:
 * - FIXED: ganzes Case wird mitgenommen, alle enthaltenen Geräte werden vom Bedarf
 *   abgezogen — auch wenn dabei mehr Geräte mitkommen als ursprünglich gebucht.
 * - VARIABLE: nur soviele Cases dieser Art wie nötig, plus ggf. Einzel-Items für
 *   den Restbedarf.
 *
 * Übrig gebliebene Bedarfe ohne passende PackUnit erscheinen als "lose" Items.
 */
export type PackListItem =
  | {
      kind: "PACK";
      packUnitId: string;
      code: string;
      name: string;
      mode: "FIXED" | "VARIABLE";
      quantity: number;
      locationName: string | null;
      weightPerUnit: number;
      contents: { deviceId: string; deviceName: string; perUnit: number; total: number }[];
    }
  | {
      kind: "LOOSE";
      deviceId: string;
      deviceName: string;
      quantity: number;
      weightPerUnit: number;
    };

type AssignmentInput = {
  deviceId: string;
  quantity: number;
  device: { name: string; weight: Prisma.Decimal | number | null };
};

type PackUnitInput = {
  id: string;
  code: string;
  name: string;
  packMode: "FIXED" | "VARIABLE";
  stockQuantity: number;
  weight: Prisma.Decimal | number | null;
  location: { name: string } | null;
  items: { deviceId: string; quantity: number; device: { name: string } }[];
};

/**
 * Berechnet die Packliste aus Geräte-Buchungen und verfügbaren PackUnits.
 *
 * Algorithmus (greedy):
 * 1. Bedarf pro Gerät ermitteln.
 * 2. Für jedes PackUnit (sortiert: FIXED zuerst), prüfen ob ALLE enthaltenen
 *    Geräte mindestens 1× im Bedarf sind. Falls ja, PackUnit ein-/mehrfach
 *    einsetzen:
 *    - FIXED: solange noch mindestens 1 enthaltenes Gerät benötigt wird
 *      (und Bestand der PackUnit reicht), eines konsumieren.
 *    - VARIABLE: nur so viele wie für den max. Inhalts-Bedarf nötig (gerundet).
 * 3. Restbedarf landet als LOOSE-Eintrag.
 */
export function buildPackList(
  assignments: AssignmentInput[],
  packUnits: PackUnitInput[]
): PackListItem[] {
  // 1) Bedarf
  const demand = new Map<string, number>();
  const deviceWeights = new Map<string, number>();
  const deviceNames = new Map<string, string>();
  for (const a of assignments) {
    demand.set(a.deviceId, (demand.get(a.deviceId) ?? 0) + a.quantity);
    deviceWeights.set(a.deviceId, Number(a.device.weight ?? 0));
    deviceNames.set(a.deviceId, a.device.name);
  }

  // 2) PackUnits durchgehen — FIXED zuerst, dann VARIABLE
  const sortedPacks = [...packUnits].sort((a, b) => {
    if (a.packMode === b.packMode) return 0;
    return a.packMode === "FIXED" ? -1 : 1;
  });

  const result: PackListItem[] = [];

  for (const pu of sortedPacks) {
    if (pu.items.length === 0) continue;
    // Wie viele dieser PackUnits können wir maximal nutzen?
    // Limit 1: vorhandener Bestand der PackUnit
    // Limit 2: pro enthaltenes Gerät: ⌈Bedarf / Anzahl-pro-Case⌉
    let maxUseful = Infinity;
    for (const it of pu.items) {
      const dem = demand.get(it.deviceId) ?? 0;
      if (dem <= 0) {
        maxUseful = 0;
        break;
      }
      const need = Math.ceil(dem / it.quantity);
      if (need < maxUseful) maxUseful = need;
    }
    if (maxUseful === 0 || maxUseful === Infinity) continue;

    const useCount = Math.min(pu.stockQuantity, maxUseful);
    if (useCount === 0) continue;

    // Geräte aus Demand abziehen
    for (const it of pu.items) {
      const taken = it.quantity * useCount;
      const dem = demand.get(it.deviceId) ?? 0;
      // FIXED: kann zu viel mitnehmen (dem - taken < 0), das ist OK
      // VARIABLE: niemals mehr als Bedarf
      const consume = pu.packMode === "FIXED" ? taken : Math.min(taken, dem);
      demand.set(it.deviceId, Math.max(0, dem - consume));
    }

    const totalWeight = Number(pu.weight ?? 0);
    result.push({
      kind: "PACK",
      packUnitId: pu.id,
      code: pu.code,
      name: pu.name,
      mode: pu.packMode,
      quantity: useCount,
      locationName: pu.location?.name ?? null,
      weightPerUnit: totalWeight,
      contents: pu.items.map((it) => ({
        deviceId: it.deviceId,
        deviceName: it.device.name,
        perUnit: it.quantity,
        total: it.quantity * useCount,
      })),
    });
  }

  // 3) Restbedarf als LOOSE
  for (const [deviceId, qty] of demand) {
    if (qty <= 0) continue;
    result.push({
      kind: "LOOSE",
      deviceId,
      deviceName: deviceNames.get(deviceId) ?? "(unbekannt)",
      quantity: qty,
      weightPerUnit: deviceWeights.get(deviceId) ?? 0,
    });
  }

  return result;
}
