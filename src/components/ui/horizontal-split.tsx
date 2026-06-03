"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface Props {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultLeftPx?: number;
  minLeftPx?: number;
  minRightPx?: number;
  storageKey?: string;
  className?: string;
}

export function HorizontalSplit({
  left,
  right,
  defaultLeftPx = 320,
  minLeftPx = 240,
  minRightPx = 320,
  storageKey,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPx, setLeftPx] = useState<number>(defaultLeftPx);
  const [dragging, setDragging] = useState(false);

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
    function onMove(e: MouseEvent) {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const maxLeft = Math.max(minLeftPx, rect.width - minRightPx);
      const next = Math.max(minLeftPx, Math.min(maxLeft, x));
      setLeftPx(next);
    }
    function onUp() { setDragging(false); }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [dragging, minLeftPx, minRightPx]);

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
      <div className="w-full lg:w-[var(--left-w)] lg:shrink-0">{left}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={(e) => { e.preventDefault(); setDragging(true); }}
        onDoubleClick={() => setLeftPx(defaultLeftPx)}
        title="Ziehen zum Verschieben · Doppelklick zum Zurücksetzen"
        className={cn(
          "hidden lg:flex group relative w-4 shrink-0 cursor-col-resize select-none items-center justify-center",
          "before:absolute before:inset-y-2 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-border",
          "hover:before:bg-primary",
          dragging && "before:bg-primary"
        )}
      >
        <div
          className={cn(
            "z-10 h-10 w-1 rounded-full bg-border transition-colors",
            "group-hover:bg-primary",
            dragging && "bg-primary"
          )}
        />
      </div>
      <div className="min-w-0 flex-1">{right}</div>
    </div>
  );
}
