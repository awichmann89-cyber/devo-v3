import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildPackList, type PackListItem } from "@/lib/packlist";
import { groupItemsByCategory } from "@/lib/category-tree";

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

/**
 * Ad-hoc-Position eines Projekts („Vorübergehendes Gerät") auf der Packliste.
 *
 * Sie hängt an einer Material-Gruppe statt an einer Kategorie und ist keinem
 * Lagerbestand zugeordnet — deshalb steht sie nicht in den Kategorie-Sektionen,
 * sondern in einer eigenen Sektion am Ende der Liste. Ein Gewicht führt das
 * Datenmodell für sie nicht, gepackt werden muss sie trotzdem.
 */
export type AdHocPackItem = {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
};

/** Eine Kategorie-Sektion der Liste, inkl. Packeinheiten/lose Geräte/Kabel. */
export type PackListCategoryGroup = {
  key: string;
  /** Voller Kategorie-Pfad, z.B. „Ton / Mikrofone". */
  label: string;
  packs: PackItem[];
  loose: LooseItem[];
  cables: CableItem[];
};

/**
 * Eine Kategorie-Ebene der Packliste in Baum-Reihenfolge.
 *
 * Anders als `PackListCategoryGroup` (ein Eintrag pro Kategorie mit vollem
 * Pfad-Label) ist das hier die aufgeklappte Ordnerstruktur: Eltern stehen vor
 * ihren Kindern, `depth` gibt die Einrücktiefe, `name` nur das eigene Segment.
 * Zwischenebenen ohne eigene Positionen kommen als leere Sektion mit — sonst
 * fehlte im Baum der Ast, unter dem die Unterkategorien hängen.
 */
export type PackListCategorySection = {
  key: string;
  /** Nur der eigene Kategoriename, z.B. „Mikrofone" (nicht „Ton / Mikrofone"). */
  name: string;
  /** 0 = Hauptkategorie; jede Ebene wird beim Rendern eingerückt. */
  depth: number;
  packs: PackItem[];
  loose: LooseItem[];
  cables: CableItem[];
};

export type PackListTotals = {
  packs: number;
  /**
   * Geräte inkl. der in Packeinheiten mitreisenden und der Vorübergehenden
   * Geräte — die Summe zählt Packstücke, nicht Lagerartikel.
   */
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
  // Nach Gruppe und dann nach Position sortiert — `sortOrder` ist nur
  // innerhalb einer Gruppe eindeutig (siehe nextSortOrderForGroup()).
  adHocItems: {
    orderBy: [{ group: { sortOrder: "asc" } }, { sortOrder: "asc" }],
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
  /**
   * Dieselben Positionen als Kategorie-Baum (Ordnerstruktur). Die Packliste
   * rendert daraus ihre eingerückten Sektionen; der Lieferschein bleibt bei
   * `groups` mit vollem Pfad-Label.
   */
  sections: PackListCategorySection[];
  /** Vorübergehende Geräte des Projekts — eigene Sektion, siehe AdHocPackItem. */
  adhoc: AdHocPackItem[];
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
      device: {
        name: a.device.name,
        description: a.device.description,
        weight: a.device.weight,
      },
    })),
    candidatePackUnits.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
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

  // Jede Position einmal ihrer Kategorie zuordnen — daraus entstehen sowohl
  // die flachen Gruppen (Lieferschein) als auch der Kategorie-Baum (Packliste).
  const tagged: { categoryId: string | null; item: PackListItem }[] = [];
  for (const item of items) {
    let categoryId: string | null;
    if (item.kind === "PACK") {
      const pu = candidatePackUnits.find((c) => c.id === item.packUnitId);
      categoryId = pu?.categoryId ?? null;
      ensureGroup(categoryId).packs.push(item);
    } else if (item.kind === "LOOSE") {
      const a = project.assignments.find((x) => x.deviceId === item.deviceId);
      categoryId = a?.device.categoryId ?? null;
      ensureGroup(categoryId).loose.push(item);
    } else {
      const ca = project.cableAssignments.find((x) => x.cableId === item.cableId);
      categoryId = ca?.cable.categoryId ?? null;
      ensureGroup(categoryId).cables.push(item);
    }
    tagged.push({ categoryId, item });
  }

  const groups = Array.from(groupMap.values())
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey, "de"))
    .map(({ sortKey: _sortKey, ...g }) => g);

  // ===== Dieselben Positionen als Baum =====
  // Bewusst über denselben Helfer wie die Material-Listen und die digitale
  // Packliste, damit die Ordnerstruktur überall identisch aussieht
  // (Eltern vor Kindern, alphabetisch, Zwischenebenen als leere Header).
  const sections: PackListCategorySection[] = groupItemsByCategory(
    tagged,
    allCategories
  ).map((g) => ({
    key: g.key,
    name: g.name,
    depth: g.depth,
    packs: g.items.map((t) => t.item).filter((i) => i.kind === "PACK"),
    loose: g.items.map((t) => t.item).filter((i) => i.kind === "LOOSE"),
    cables: g.items.map((t) => t.item).filter((i) => i.kind === "CABLE"),
  }));

  // ===== Vorübergehende Geräte =====
  const adhoc: AdHocPackItem[] = project.adHocItems.map((it) => ({
    id: it.id,
    name: it.name,
    description: it.description,
    quantity: it.quantity,
  }));
  const adhocQuantity = adhoc.reduce((s, it) => s + it.quantity, 0);

  // ===== Summen =====
  const totals: PackListTotals = {
    packs: items.reduce((s, p) => (p.kind === "PACK" ? s + p.quantity : s), 0),
    devices:
      items.reduce((s, p) => {
        if (p.kind === "PACK") return s + p.contents.reduce((cs, c) => cs + c.total, 0);
        if (p.kind === "CABLE") return s;
        return s + p.quantity;
      }, 0) + adhocQuantity,
    cables: items.reduce((s, p) => {
      if (p.kind === "PACK") return s + p.cables.reduce((cs, c) => cs + c.total, 0);
      if (p.kind === "CABLE") return s + p.quantity;
      return s;
    }, 0),
    weightKg: items.reduce((s, p) => s + p.weightPerUnit * p.quantity, 0),
  };

  return { project, items, groups, sections, adhoc, totals };
}
