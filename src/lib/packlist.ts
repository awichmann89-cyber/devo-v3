import { Prisma } from "@prisma/client";

/**
 * Eine PackUnit (Case) wird auf der Packliste als Eintrag aufgeführt:
 * - FIXED: ganzes Case wird mitgenommen, alle enthaltenen Geräte werden vom Bedarf
 *   abgezogen — auch wenn dabei mehr Geräte mitkommen als ursprünglich gebucht.
 *   useCount = max ⌈Bedarf/Inhalt⌉ über alle Items (alle Bedarfe gedeckt).
 * - VARIABLE: es werden nur VOLLE Cases gepackt. Was nicht in ein volles Case
 *   passt, wird als loses Gerät aufgeführt.
 *   useCount = min ⌊Bedarf/Inhalt⌋ über alle Items.
 *
 * Die Packliste leitet die Anzahl der Cases ausschließlich aus dem Bedarf ab —
 * sie ist nicht durch `stockQuantity` der PackUnit begrenzt.
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
 *    Geräte mindestens 1× im Bedarf sind:
 *    - FIXED: useCount = max ⌈Bedarf/Inhalt⌉ — Case immer komplett, kann
 *      mehr Geräte mitnehmen als nötig.
 *    - VARIABLE: useCount = min ⌊Bedarf/Inhalt⌋ — nur volle Cases; Bedarf, der
 *      nicht mehr in ein volles Case passt, fällt nach Punkt 3 als LOOSE raus.
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

    // Bedarf-Snapshot VOR dem Konsumieren, damit "Gesamt" pro Inhalts-Gerät
    // korrekt sein kann (insbesondere für VARIABLE).
    const demandBefore = new Map<string, number>();
    for (const it of pu.items) {
      demandBefore.set(it.deviceId, demand.get(it.deviceId) ?? 0);
    }

    // Wie viele dieser PackUnits brauchen wir?
    // FIXED  → max ⌈Bedarf / Inhalt⌉ (jedes enthaltene Gerät muss gedeckt sein)
    // VARIABLE → min ⌊Bedarf / Inhalt⌋ (nur volle Cases — Rest fällt als LOOSE raus)
    // Wenn auch nur EIN enthaltenes Gerät gar nicht im Bedarf steht, wird das Pack übersprungen.
    let useCount = pu.packMode === "FIXED" ? 0 : Number.POSITIVE_INFINITY;
    let anyZero = false;
    for (const it of pu.items) {
      const dem = demandBefore.get(it.deviceId) ?? 0;
      if (dem <= 0) {
        anyZero = true;
        break;
      }
      if (pu.packMode === "FIXED") {
        const need = Math.ceil(dem / it.quantity);
        if (need > useCount) useCount = need;
      } else {
        const fits = Math.floor(dem / it.quantity);
        if (fits < useCount) useCount = fits;
      }
    }
    if (anyZero || !Number.isFinite(useCount) || useCount === 0) continue;

    // Geräte aus Demand abziehen
    // Bei beiden Modi: useCount Cases werden komplett gepackt (it.quantity * useCount Stück).
    // FIXED kann den Bedarf übersteigen (das ist Sinn der Sache).
    // VARIABLE übersteigt durch floor() nie den Bedarf — Rest bleibt als LOOSE.
    for (const it of pu.items) {
      const taken = it.quantity * useCount;
      const dem = demand.get(it.deviceId) ?? 0;
      demand.set(it.deviceId, Math.max(0, dem - taken));
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
