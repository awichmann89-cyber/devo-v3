import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildPackList, type PackListItem } from "@/lib/packlist";

/**
 * Lade- und Gruppierungsschicht über `buildPackList()`.
 *
 * `buildPackList()` selbst ist bewusst pur (kein Prisma) — die Beschaffung der
 * Daten und die Gruppierung nach Kategorie brauchen aber Packliste UND
 * Lieferschein in exakt gleicher Form. Deshalb liegt beides hier, statt in
 * jedem PDF-Route-Handler erneut ausgeschrieben zu werden: was auf der
 * Packliste steht, steht damit garantiert auch auf dem Lieferschein.
 *
 * Das Rendering bleibt getrennt — die Packliste ist ein internes Arbeitspapier,
 * der Lieferschein ein Kundendokument im CI.
 */

export type PackItem = Extract<PackListItem, { kind: "PACK" }>;
export type LooseItem = Extract<PackListItem, { kind: "LOOSE" }>;
export type CableItem = Extract<PackListItem, { kind: "CABLE" }>;

/** Eine Kategorie-Sektion der Liste, inkl. Packeinheiten/lose Geräte/Kabel. */
export type PackListCategoryGroup = {
  key: string;
  /** Voller Kategorie-Pfad, z.B. „Ton / Mikrofone". */
  label: string;
  packs: PackItem[];
  loose: LooseItem[];
  cables: CableItem[];
};

export type PackListTotals = {
  packs: number;
  /** Geräte inkl. der in Packeinheiten mitreisenden. */
  devices: number;
  /** Gebuchte Kabel + die in Packeinheiten mitreisenden. */
  cables: number;
  weightKg: number;
};

const PACKLIST_PROJECT_INCLUDE = {
  customer: true,
  assignments: {
    include: { device: { include: { category: true } } },
  },
  cableAssignments: {
    include: { cable: { include: { category: true } } },
  },
} satisfies Prisma.ProjectInclude;

export type PackListProject = Prisma.ProjectGetPayload<{
  include: typeof PACKLIST_PROJECT_INCLUDE;
}>;

export type ProjectPackList = {
  project: PackListProject;
  /** Flache Liste, ungruppiert — für Summen und Weiterverarbeitung. */
  items: PackListItem[];
  /** Nach Kategorie-Pfad gruppiert und alphabetisch sortiert. */
  groups: PackListCategoryGroup[];
  totals: PackListTotals;
};

/**
 * Lädt Projekt, Buchungen und passende Packeinheiten, berechnet die Packliste
 * und gruppiert sie nach Kategorie. `null`, wenn es das Projekt nicht gibt.
 */
export async function loadProjectPackList(
  projectId: string
): Promise<ProjectPackList | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: PACKLIST_PROJECT_INCLUDE,
  });
  if (!project) return null;

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
      cableItems: { include: { cable: true } },
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
      // „￿" (U+FFFF) sortiert hinter allem — „Ohne Kategorie" bleibt unten.
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

  const items = buildPackList(
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
      cableItems: p.cableItems.map((ci) => ({
        cableId: ci.cableId,
        quantity: ci.quantity,
        cable: ci.cable,
      })),
    })),
    project.cableAssignments.map((ca) => ({
      cableId: ca.cableId,
      quantity: ca.quantity,
      cable: ca.cable,
    }))
  );

  // ===== Gruppierung nach Kategorie =====
  type InternalGroup = PackListCategoryGroup & { sortKey: string };
  const groupMap = new Map<string, InternalGroup>();
  function ensureGroup(categoryId: string | null): InternalGroup {
    const info = categoryPath(categoryId);
    const existing = groupMap.get(info.key);
    if (existing) return existing;
    const g: InternalGroup = {
      key: info.key,
      label: info.label,
      sortKey: info.sortKey,
      packs: [],
      loose: [],
      cables: [],
    };
    groupMap.set(info.key, g);
    return g;
  }

  for (const item of items) {
    if (item.kind === "PACK") {
      const pu = candidatePackUnits.find((c) => c.id === item.packUnitId);
      ensureGroup(pu?.categoryId ?? null).packs.push(item);
    } else if (item.kind === "LOOSE") {
      const a = project.assignments.find((x) => x.deviceId === item.deviceId);
      ensureGroup(a?.device.categoryId ?? null).loose.push(item);
    } else {
      const ca = project.cableAssignments.find((x) => x.cableId === item.cableId);
      ensureGroup(ca?.cable.categoryId ?? null).cables.push(item);
    }
  }

  const groups = Array.from(groupMap.values())
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey, "de"))
    .map(({ sortKey: _sortKey, ...g }) => g);

  // ===== Summen =====
  const totals: PackListTotals = {
    packs: items.reduce((s, p) => (p.kind === "PACK" ? s + p.quantity : s), 0),
    devices: items.reduce((s, p) => {
      if (p.kind === "PACK") return s + p.contents.reduce((cs, c) => cs + c.total, 0);
      if (p.kind === "CABLE") return s;
      return s + p.quantity;
    }, 0),
    cables: items.reduce((s, p) => {
      if (p.kind === "PACK") return s + p.cables.reduce((cs, c) => cs + c.total, 0);
      if (p.kind === "CABLE") return s + p.quantity;
      return s;
    }, 0),
    weightKg: items.reduce((s, p) => s + p.weightPerUnit * p.quantity, 0),
  };

  return { project, items, groups, totals };
}
