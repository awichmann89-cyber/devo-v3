"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Ab dieser Breite (Tailwind `lg`) wird die Höhe begrenzt. */
const LG_BREAKPOINT = 1024;
/** Luft unter der Karte, damit sie nicht am Fensterrand klebt. */
const BOTTOM_GAP = 16;
/** Unter dieser Höhe lohnt das Klammern nicht — dann lieber Seite scrollen. */
const MIN_HEIGHT = 360;

/**
 * Begrenzt ein Element auf den Platz, der im Viewport unter ihm noch übrig ist —
 * gemessen, nicht geschätzt.
 *
 * Die Zuordnungs-Tabellen im Projekt (Material, Personal & Transport,
 * Zumietung & Kosten) sollen in ihrer eigenen Fläche scrollen, damit die
 * Katalog-Suche beim Scrollen nicht hinter dem App-Header verschwindet. Vorher
 * stand dafür ein festes `max-h-[calc(100vh-80px)]` im Markup — die Formel
 * unterstellt, über der Karte stünde nur der 52px-Header. Tatsächlich stehen
 * dort DetailHeader, Kachelreihe und Tab-Leiste, zusammen rund 230px mehr. Die
 * Folge: die Fußzeile mit „Gruppe hinzufügen" und der Netto-Summe lag beim
 * Laden unter dem Falz, und es gab zwei Scrollbalken — Seite und Tabelle.
 *
 * Gemessen wird die Dokument-Position des Elements, nicht die aktuelle
 * Viewport-Position. Damit ist das Ergebnis unabhängig davon, wie weit die
 * Seite gerade gescrollt ist.
 */
export function useViewportFill<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (window.innerWidth < LG_BREAKPOINT) {
      setMaxHeight(null);
      return;
    }
    const docTop = el.getBoundingClientRect().top + window.scrollY;
    const available = window.innerHeight - docTop - BOTTOM_GAP;
    setMaxHeight(available >= MIN_HEIGHT ? available : null);
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    // Layout über der Karte kann sich ändern (Badges umbrechen, Streifen
    // erscheint/verschwindet) — dann neu messen.
    const observer = new ResizeObserver(measure);
    if (ref.current?.parentElement) observer.observe(ref.current.parentElement);
    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [measure]);

  return {
    ref,
    style: maxHeight === null ? undefined : { maxHeight: `${maxHeight}px` },
    /** true, sobald geklammert wird — für `overflow-hidden` am Container. */
    clamped: maxHeight !== null,
  };
}
