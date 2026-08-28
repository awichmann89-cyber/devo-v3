import { Prisma } from "@prisma/client";
import { cableSpecLabel, cableSpecParts } from "@/lib/labels";

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
 *
 * Gebuchte Kabel (ProjectCableAssignment) erscheinen als eigene CABLE-Einträge.
 * Sie werden NICHT gegen Kabel im Case verrechnet: was im Case liegt, ist
 * Case-Inventar; was gebucht wurde, wird zusätzlich gepackt.
 */
/** Länge und Steckerenden einzeln, siehe cableSpecParts(). */
type CableSpecParts = { lengthLabel: string | null; connectors: string | null };

export type PackListItem =
  | {
      kind: "PACK";
      packUnitId: string;
      code: string;
      name: string;
      /** Freitext aus den Stammdaten — auf der Packliste als Kleingedrucktes. */
      description: string | null;
      mode: "FIXED" | "VARIABLE";
      quantity: number;
      locationName: string | null;
      // Leergewicht des Cases + Gewicht der enthaltenen Kabel (pro Case).
      // Geräte im Case zählen hier bewusst nicht mit.
      weightPerUnit: number;
      contents: { deviceId: string; deviceName: string; perUnit: number; total: number }[];
      // Kabel die in dieser Packeinheit stecken — reisen mit Case mit.
      // Bedarfsunabhängig: was im Case ist, kommt mit.
      // `spec` = Länge + Steckerenden, siehe cableSpecLabel().
      cables: {
        cableId: string;
        cableName: string;
        spec: string | null;
        specParts: CableSpecParts;
        perUnit: number;
        total: number;
      }[];
    }
  | {
      kind: "LOOSE";
      deviceId: string;
      deviceName: string;
      description: string | null;
      quantity: number;
      weightPerUnit: number;
    }
  | {
      // Für das Projekt gebuchtes Kabel — wird lose gepackt und auf der
      // digitalen Packliste manuell abgehakt (kein QR-Code an Kabeln).
      kind: "CABLE";
      cableId: string;
      cableName: string;
      description: string | null;
      // Länge + Steckerenden zur eindeutigen Identifikation beim Packen
      spec: string | null;
      // Dieselbe Angabe getrennt — die Packliste setzt die Steckerenden als
      // eigene Kleingedruckt-Zeile unter die Position, statt sie anzuhängen.
      specParts: CableSpecParts;
      quantity: number;
      weightPerUnit: number;
    };

type AssignmentInput = {
  deviceId: string;
  quantity: number;
  device: {
    name: string;
    description?: string | null;
    weight: Prisma.Decimal | number | null;
  };
};

/** Kabel-Stammdaten, soweit die Packliste sie braucht. */
type CableInput = {
  name: string;
  description?: string | null;
  weight?: Prisma.Decimal | number | null;
  lengthMeters?: Prisma.Decimal | number | null;
  connectorA?: string | null;
  connectorB?: string | null;
};

type CableAssignmentInput = {
  cableId: string;
  quantity: number;
  cable: CableInput & { weight: Prisma.Decimal | number | null };
};

type PackUnitInput = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  packMode: "FIXED" | "VARIABLE";
  weight: Prisma.Decimal | number | null;
  location: { name: string } | null;
  items: { deviceId: string; quantity: number; device: { name: string } }[];
  // Optional: Kabel im Case. Wenn nicht übergeben, leeres Array.
  cableItems?: { cableId: string; quantity: number; cable: CableInput }[];
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
 * 4. Gebuchte Kabel werden pro Kabel-Typ summiert und als CABLE-Einträge
 *    angehängt (unabhängig von den Cases, siehe Typ-Doku oben).
 */
export function buildPackList(
  assignments: AssignmentInput[],
  packUnits: PackUnitInput[],
  cableAssignments: CableAssignmentInput[] = []
): PackListItem[] {
  // 1) Bedarf
  const demand = new Map<string, number>();
  const deviceWeights = new Map<string, number>();
  const deviceNames = new Map<string, string>();
  const deviceDescriptions = new Map<string, string | null>();
  for (const a of assignments) {
    demand.set(a.deviceId, (demand.get(a.deviceId) ?? 0) + a.quantity);
    deviceWeights.set(a.deviceId, Number(a.device.weight ?? 0));
    deviceNames.set(a.deviceId, a.device.name);
    deviceDescriptions.set(a.deviceId, a.device.description ?? null);
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
    // FIXED  → max ⌈Bedarf / Inhalt⌉ über alle Items MIT Bedarf
    //          (Case wird komplett mitgenommen — Inhalte ohne Bedarf fahren
    //          als Mitbringsel mit. Mindestens EIN Item muss aber gebucht sein,
    //          sonst hätte das Case keinen Anlass mitzukommen.)
    // VARIABLE → min ⌊Bedarf / Inhalt⌋ — alle Inhalte müssen gebucht sein,
    //          sonst kann das Case nicht voll gepackt werden.
    let useCount = pu.packMode === "FIXED" ? 0 : Number.POSITIVE_INFINITY;
    let anyZero = false;       // gibt es Items ohne Bedarf? (für VARIABLE = Abbruch)
    let anyNonZero = false;    // gibt es überhaupt einen Bedarf-Treffer? (für FIXED = Pflicht)
    for (const it of pu.items) {
      const dem = demandBefore.get(it.deviceId) ?? 0;
      if (dem <= 0) {
        anyZero = true;
        if (pu.packMode === "VARIABLE") break; // VARIABLE bricht direkt ab
        continue; // FIXED ignoriert solche Items für useCount, packt sie aber mit
      }
      anyNonZero = true;
      if (pu.packMode === "FIXED") {
        const need = Math.ceil(dem / it.quantity);
        if (need > useCount) useCount = need;
      } else {
        const fits = Math.floor(dem / it.quantity);
        if (fits < useCount) useCount = fits;
      }
    }
    if (pu.packMode === "VARIABLE") {
      if (anyZero || !Number.isFinite(useCount) || useCount === 0) continue;
    } else {
      // FIXED braucht mindestens ein gebuchtes Item, um sich überhaupt zu lohnen.
      if (!anyNonZero || useCount === 0) continue;
    }

    // Geräte aus Demand abziehen
    // Bei beiden Modi: useCount Cases werden komplett gepackt (it.quantity * useCount Stück).
    // FIXED kann den Bedarf übersteigen (das ist Sinn der Sache).
    // VARIABLE übersteigt durch floor() nie den Bedarf — Rest bleibt als LOOSE.
    for (const it of pu.items) {
      const taken = it.quantity * useCount;
      const dem = demand.get(it.deviceId) ?? 0;
      demand.set(it.deviceId, Math.max(0, dem - taken));
    }

    // Gewicht pro Case: Leergewicht + die fest darin liegenden Kabel.
    const cableWeight = (pu.cableItems ?? []).reduce(
      (s, ci) => s + Number(ci.cable.weight ?? 0) * ci.quantity,
      0
    );
    const totalWeight = Number(pu.weight ?? 0) + cableWeight;
    result.push({
      kind: "PACK",
      packUnitId: pu.id,
      code: pu.code,
      name: pu.name,
      description: pu.description ?? null,
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
      cables: (pu.cableItems ?? []).map((ci) => ({
        cableId: ci.cableId,
        cableName: ci.cable.name,
        spec: cableSpecLabel(ci.cable),
        specParts: cableSpecParts(ci.cable),
        perUnit: ci.quantity,
        total: ci.quantity * useCount,
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
      description: deviceDescriptions.get(deviceId) ?? null,
      quantity: qty,
      weightPerUnit: deviceWeights.get(deviceId) ?? 0,
    });
  }

  // 4) Gebuchte Kabel — pro Kabel-Typ summiert (dasselbe Kabel kann in
  //    mehreren Gruppen gebucht sein).
  const cableDemand = new Map<string, number>();
  const cableNames = new Map<string, string>();
  const cableSpecs = new Map<string, string | null>();
  const cableSpecPartsById = new Map<string, CableSpecParts>();
  const cableDescriptions = new Map<string, string | null>();
  const cableWeights = new Map<string, number>();
  for (const ca of cableAssignments) {
    cableDemand.set(ca.cableId, (cableDemand.get(ca.cableId) ?? 0) + ca.quantity);
    cableNames.set(ca.cableId, ca.cable.name);
    cableSpecs.set(ca.cableId, cableSpecLabel(ca.cable));
    cableSpecPartsById.set(ca.cableId, cableSpecParts(ca.cable));
    cableDescriptions.set(ca.cableId, ca.cable.description ?? null);
    cableWeights.set(ca.cableId, Number(ca.cable.weight ?? 0));
  }
  for (const [cableId, qty] of cableDemand) {
    if (qty <= 0) continue;
    result.push({
      kind: "CABLE",
      cableId,
      cableName: cableNames.get(cableId) ?? "(unbekannt)",
      description: cableDescriptions.get(cableId) ?? null,
      spec: cableSpecs.get(cableId) ?? null,
      specParts: cableSpecPartsById.get(cableId) ?? {
        lengthLabel: null,
        connectors: null,
      },
      quantity: qty,
      weightPerUnit: cableWeights.get(cableId) ?? 0,
    });
  }

  return result;
}
