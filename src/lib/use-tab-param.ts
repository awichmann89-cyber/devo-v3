"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Hält den aktiven Tab in der URL (`?tab=…`).
 *
 * Ohne das ist ein Tab nicht verlinkbar, der Zurück-Button überspringt ihn und
 * ein Reload landet immer auf dem ersten Tab — auf der Projekt-Detailseite also
 * auf „Details", obwohl die Arbeit in Material/Personal/Kosten passiert.
 *
 * `replace` statt `push`: Tab-Wechsel sind Navigation innerhalb einer Seite und
 * sollen die History nicht mit Zwischenschritten fluten. `scroll: false`, damit
 * der Wechsel nicht nach oben springt.
 *
 * Verwendung:
 * ```tsx
 * const [tab, setTab] = useTabParam("details");
 * <Tabs value={tab} onValueChange={setTab}>
 * ```
 *
 * @param defaultValue Tab, der ohne `?tab=` aktiv ist.
 * @param key Query-Parameter (default `tab`) — für mehrere Tab-Gruppen pro Seite.
 */
export function useTabParam(
  defaultValue: string,
  key = "tab"
): [string, (value: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const value = params.get(key) ?? defaultValue;

  const setValue = useCallback(
    (next: string) => {
      const p = new URLSearchParams(params.toString());
      // Der Default steht nicht in der URL — sonst trägt jeder Link Ballast.
      if (next === defaultValue) p.delete(key);
      else p.set(key, next);
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, router, pathname, defaultValue, key]
  );

  return [value, setValue];
}
