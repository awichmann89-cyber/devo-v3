"use client";

import { useEffect, useRef, useState } from "react";

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Beobachtet `value` und ruft `save` debounced auf, sobald sich der Wert
 * gegenüber dem letzten Stand ändert. Der initiale Wert wird nie gespeichert.
 *
 * `value` sollte ein stabil serialisierbarer Wert sein (z.B. ein Objekt aus
 * Form-Feldern). Wir vergleichen per JSON-Serialisierung, um auch nested
 * Strukturen wie Arrays zu erkennen.
 */
export function useAutoSave<T>(
  value: T,
  save: (v: T) => Promise<void>,
  options: { delay?: number; enabled?: boolean } = {}
): { status: AutoSaveStatus; error: string | null } {
  const { delay = 800, enabled = true } = options;
  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const lastSavedKey = useRef<string>(JSON.stringify(value));
  const isFirst = useRef(true);
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const key = JSON.stringify(value);
    if (isFirst.current) {
      isFirst.current = false;
      lastSavedKey.current = key;
      return;
    }
    if (key === lastSavedKey.current) return;

    setStatus("saving");
    const t = setTimeout(async () => {
      try {
        await save(value);
        lastSavedKey.current = key;
        setStatus("saved");
        setError(null);
        if (savedTimeout.current) clearTimeout(savedTimeout.current);
        savedTimeout.current = setTimeout(() => {
          setStatus((s) => (s === "saved" ? "idle" : s));
        }, 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
        setStatus("error");
      }
    }, delay);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value), enabled]);

  return { status, error };
}
