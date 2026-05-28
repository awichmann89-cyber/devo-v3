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
