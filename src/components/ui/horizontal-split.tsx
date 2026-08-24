"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultLeftPx?: number;
  minLeftPx?: number;
  minRightPx?: number;
  storageKey?: string;
  className?: string;
  /**
   * Zusätzliche Klassen für den Wrapper der linken Spalte. Damit kann die
   * linke Spalte z.B. sticky-positioniert werden, sodass der Katalog beim
   * Scrollen sichtbar bleibt, während die rechte Spalte die Seitenhöhe
   * bestimmt.
   */
  leftClassName?: string;
  /**
   * Zusätzliche Klassen für den Wrapper der rechten Spalte — symmetrisch zu
   * `leftClassName`. Nötig, wenn beide Spalten auf Viewport-Höhe begrenzt und
   * unabhängig scrollbar sein sollen (dann füllt der Wrapper per Flex die Höhe,
   * statt sich an prozentualen Höhen aufzuhängen).
   */
  rightClassName?: string;
  /**
   * Wenn gesetzt, ist die linke Spalte auf Mobil (< lg) zunächst ausgeblendet
   * und nur über einen Button erreichbar — auf kleinen Displays wird sonst
   * beides übereinander gestapelt und damit unübersichtlich. Der Text benennt
   * den Inhalt der linken Spalte, z.B. „Katalog". Auf Desktop ändert sich
   * nichts.
   */
  mobileLeftLabel?: string;
}

export function HorizontalSplit({
  left,
  right,
  defaultLeftPx = 320,
  minLeftPx = 240,
  minRightPx = 320,
  storageKey,
  className,
  leftClassName,
  rightClassName,
  mobileLeftLabel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPx, setLeftPx] = useState<number>(defaultLeftPx);
  const [dragging, setDragging] = useState(false);
  // Bewusst nicht persistiert: beim Öffnen der Seite soll auf dem Handy
  // zuerst die gebuchte Liste zu sehen sein, nicht der Katalog.
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
  const leftId = useId();

  useEffect(() => {
    if (!storageKey) return;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const v = Number(stored);
      if (isFinite(v) && v >= minLeftPx) setLeftPx(v);
    }
  }, [storageKey, minLeftPx]);

  useEffect(() => {
    if (!dragging) return;
    // Pointer-Events statt Mouse-Events: deckt Maus, Touch und Pen ab. Vorher
    // war der Griff auf Tablets nicht bedienbar.
    function onMove(e: PointerEvent) {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const maxLeft = Math.max(minLeftPx, rect.width - minRightPx);
      const next = Math.max(minLeftPx, Math.min(maxLeft, x));
      setLeftPx(next);
    }
    function onUp() { setDragging(false); }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [dragging, minLeftPx, minRightPx]);

  /** Tastatur-Bedienung des Griffs: Pfeiltasten, Home/End, 20px pro Schritt. */
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const rect = containerRef.current?.getBoundingClientRect();
    const maxLeft = rect
      ? Math.max(minLeftPx, rect.width - minRightPx)
      : minLeftPx;
    const step = e.shiftKey ? 60 : 20;
    let next: number | null = null;
    if (e.key === "ArrowLeft") next = leftPx - step;
    else if (e.key === "ArrowRight") next = leftPx + step;
    else if (e.key === "Home") next = minLeftPx;
    else if (e.key === "End") next = maxLeft;
    else if (e.key === "Enter" || e.key === " ") next = defaultLeftPx;
    if (next === null) return;
    e.preventDefault();
    setLeftPx(Math.max(minLeftPx, Math.min(maxLeft, next)));
  }

  useEffect(() => {
    if (!dragging && storageKey) {
      localStorage.setItem(storageKey, String(leftPx));
    }
  }, [dragging, leftPx, storageKey]);

  const style = { "--left-w": leftPx + "px" } as CSSProperties;

  return (
    <div
      ref={containerRef}
      className={cn("flex flex-col gap-4 lg:flex-row lg:gap-0", className)}
      style={style}
    >
      {mobileLeftLabel && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full lg:hidden"
          aria-expanded={mobileLeftOpen}
          aria-controls={leftId}
          onClick={() => setMobileLeftOpen((o) => !o)}
        >
          {mobileLeftOpen ? <ChevronUp /> : <ChevronDown />}
          {mobileLeftLabel} {mobileLeftOpen ? "ausblenden" : "einblenden"}
        </Button>
      )}
      <div
        id={leftId}
        className={cn(
          "w-full lg:w-[var(--left-w)] lg:shrink-0",
          // Auf Mobil eingeklappt bzw. — aufgeklappt — auf Bildschirmhöhe
          // begrenzt und in sich scrollbar, damit die gebuchte Liste nicht
          // hinter den ganzen Katalog rutscht.
          mobileLeftLabel && !mobileLeftOpen && "hidden lg:block",
          mobileLeftLabel &&
            mobileLeftOpen &&
            "max-h-[70svh] overflow-y-auto lg:max-h-none lg:overflow-visible",
          leftClassName
        )}
      >
        {left}
      </div>
      {/* Griff zwischen den Spalten. `aria-orientation` beschreibt die
          Bewegungsrichtung des Separators, nicht seine Optik — der Griff
          bewegt sich horizontal. `tabIndex` + Pfeiltasten, damit die
          Spaltenbreite auch ohne Maus einstellbar ist. */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Spaltenbreite"
        aria-valuenow={Math.round(leftPx)}
        aria-valuemin={minLeftPx}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDoubleClick={() => setLeftPx(defaultLeftPx)}
        title="Ziehen oder Pfeiltasten zum Verschieben · Doppelklick zum Zurücksetzen"
        className={cn(
          "hidden lg:flex group relative w-4 shrink-0 cursor-col-resize touch-none select-none items-center justify-center",
          "before:absolute before:inset-y-2 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-border",
          "hover:before:bg-primary focus-visible:outline-none focus-visible:before:bg-primary",
          dragging && "before:bg-primary"
        )}
      >
        <div
          className={cn(
            "z-10 h-10 w-1 rounded-full bg-border transition-colors",
            "group-hover:bg-primary group-focus-visible:bg-primary",
            dragging && "bg-primary"
          )}
        />
      </div>
      <div className={cn("min-w-0 flex-1", rightClassName)}>{right}</div>
    </div>
  );
}
