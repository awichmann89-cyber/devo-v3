type CategoryLike = {
  id: string;
  name: string;
  parentId: string | null;
};

/**
 * Bringt eine flache Kategorie-Liste in eine Tree-Order:
 * - Pro Ebene alphabetisch sortiert
 * - Eltern vor Kindern (DFS)
 * - Liefert pro Eintrag das `depth` (0 = Hauptkategorie)
 *
 * Falls ein `parentId` auf eine Kategorie zeigt, die NICHT in der
 * übergebenen Liste enthalten ist (z.B. nach Filterung), wird der
 * Eintrag wie eine Hauptkategorie behandelt.
 */
export function flattenCategoryTree<T extends CategoryLike>(
  categories: T[]
): Array<T & { depth: number }> {
  const ids = new Set(categories.map((c) => c.id));

  const byParent = new Map<string | null, T[]>();
  for (const c of categories) {
    const effectiveParent =
      c.parentId && ids.has(c.parentId) ? c.parentId : null;
    const list = byParent.get(effectiveParent) ?? [];
    list.push(c);
    byParent.set(effectiveParent, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, "de"));
  }

  const result: Array<T & { depth: number }> = [];
  function walk(parentId: string | null, depth: number) {
    for (const c of byParent.get(parentId) ?? []) {
      result.push({ ...c, depth });
      walk(c.id, depth + 1);
    }
  }
  walk(null, 0);
  return result;
}

/**
 * Gruppiert eine Item-Liste nach `categoryId` und liefert die Gruppen
 * in Tree-Reihenfolge (Eltern vor Kindern, alphabetisch). Items ohne
 * Kategorie werden in einer "Ohne Kategorie"-Gruppe am Ende eingereiht.
 *
 * Vorfahren-Kategorien werden als Header (mit `items: []`) ebenfalls
 * mitgeliefert, sobald mindestens eine Unter-Kategorie Items hat — so
 * bleibt die volle Hierarchie sichtbar (z.B. „Ton" über „Lautsprecher",
 * auch wenn alle Geräte direkt unter „Lautsprecher" hängen).
 *
 * Pro Gruppe wird zusätzlich `ancestorKeys` mitgegeben: die IDs aller
 * Eltern-Kategorien. Damit kann der Consumer Cascade-Collapse umsetzen
 * („wenn ein Vorfahr collapsed ist, blende mich aus").
 */
export function groupItemsByCategory<
  T extends { categoryId: string | null },
  C extends CategoryLike,
>(
  items: T[],
  categories: C[]
): Array<{
  key: string;
  name: string;
  depth: number;
  items: T[];
  ancestorKeys: string[];
}> {
  const byCategoryId = new Map<string | null, T[]>();
  for (const it of items) {
    const arr = byCategoryId.get(it.categoryId) ?? [];
    arr.push(it);
    byCategoryId.set(it.categoryId, arr);
  }

  // Welche Kategorie-IDs müssen wir mindestens als Header zeigen?
  // = alle Kategorien mit direkten Items + alle deren Vorfahren.
  const byId = new Map(categories.map((c) => [c.id, c]));
  const includeIds = new Set<string>();
  for (const id of byCategoryId.keys()) {
    if (!id) continue;
    let cur: C | undefined = byId.get(id);
    while (cur) {
      if (includeIds.has(cur.id)) break;
      includeIds.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
  }

  function ancestorsOf(catId: string): string[] {
    const chain: string[] = [];
    let cur: C | undefined = byId.get(catId);
    while (cur?.parentId && byId.has(cur.parentId)) {
      chain.push(cur.parentId);
      cur = byId.get(cur.parentId);
    }
    return chain;
  }

  const ordered = flattenCategoryTree(categories);
  const result: Array<{
    key: string;
    name: string;
    depth: number;
    items: T[];
    ancestorKeys: string[];
  }> = [];
  for (const cat of ordered) {
    if (!includeIds.has(cat.id)) continue;
    const arr = byCategoryId.get(cat.id) ?? [];
    result.push({
      key: cat.id,
      name: cat.name,
      depth: cat.depth,
      items: arr,
      ancestorKeys: ancestorsOf(cat.id),
    });
  }
  const noCat = byCategoryId.get(null);
  if (noCat && noCat.length > 0) {
    result.push({
      key: "__none__",
      name: "Ohne Kategorie",
      depth: 0,
      items: noCat,
      ancestorKeys: [],
    });
  }
  return result;
}
