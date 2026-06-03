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
 * Liefert nur Gruppen mit mindestens einem Item.
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
}> {
  const byCategoryId = new Map<string | null, T[]>();
  for (const it of items) {
    const arr = byCategoryId.get(it.categoryId) ?? [];
    arr.push(it);
    byCategoryId.set(it.categoryId, arr);
  }

  const ordered = flattenCategoryTree(categories);
  const result: Array<{ key: string; name: string; depth: number; items: T[] }> = [];
  for (const cat of ordered) {
    const arr = byCategoryId.get(cat.id);
    if (arr && arr.length > 0) {
      result.push({ key: cat.id, name: cat.name, depth: cat.depth, items: arr });
    }
  }
  const noCat = byCategoryId.get(null);
  if (noCat && noCat.length > 0) {
    result.push({ key: "__none__", name: "Ohne Kategorie", depth: 0, items: noCat });
  }
  return result;
}
