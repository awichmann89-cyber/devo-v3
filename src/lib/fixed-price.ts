/**
 * Festpreis: Ist für ein Projekt ein fester Netto-Gesamtpreis hinterlegt,
 * wird der projektweite Rabatt nicht mehr manuell gepflegt, sondern so
 * berechnet, dass die Summe nach Gruppen- und Bereichs-Rabatten genau auf den
 * Festpreis kommt. Ändern sich Material oder Personal, wandert der Rabatt mit.
 *
 * Der Rabatt wird nie negativ: Liegt die Summe unter dem Festpreis, bleibt er
 * bei 0 % und der Gesamtpreis sinkt mit (kein automatischer Aufschlag).
 *
 * Ohne Rundung — sonst entstünden Cent-Abweichungen zum Festpreis. Für die
 * Anzeige `formatDiscountPercent` verwenden.
 */
export function effectiveProjectDiscountPercent(
  subAfterBereichDiscounts: number,
  storedPercent: number,
  fixedTotalNet: number | null | undefined
): number {
  if (fixedTotalNet == null || !isFinite(fixedTotalNet)) {
    return isFinite(storedPercent) ? storedPercent : 0;
  }
  if (subAfterBereichDiscounts <= 0) return 0;
  const pct = (1 - fixedTotalNet / subAfterBereichDiscounts) * 100;
  return Math.max(0, Math.min(100, pct));
}

/** Rabatt-Prozent für die Anzeige, z.B. "12,35" (max. 2 Nachkommastellen). */
export function formatDiscountPercent(pct: number): string {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(pct);
}
