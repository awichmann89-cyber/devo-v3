/**
 * Erkennt clientseitig, ob die App auf einem Handy läuft. Tablets und iPads
 * zählen bewusst NICHT als Handy — dort ist der Bildschirm groß genug, um den
 * QR-Code anzuzeigen und mit einem zweiten Gerät zu scannen.
 *
 * Bevorzugt die User-Agent Client Hints (`navigator.userAgentData.mobile`,
 * Chromium), sonst Fallback auf den klassischen User-Agent-String. iPadOS
 * meldet sich als Mac und landet dadurch automatisch auf „kein Handy".
 */
export function isPhone(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } })
    .userAgentData;
  if (typeof uaData?.mobile === "boolean") return uaData.mobile;

  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua)) return false;
  return /iPhone|iPod|Android.*Mobile|Windows Phone|Mobi/i.test(ua);
}
