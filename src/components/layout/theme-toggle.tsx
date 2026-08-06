"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Light/Dark-Umschalter aus dem Redesign. Persistiert die Wahl in
 * localStorage; der Init-Script in src/app/layout.tsx liest sie vor dem
 * ersten Paint wieder aus.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // localStorage nicht verfügbar (z.B. Private Mode) — Theme gilt dann nur für die Session
    }
  }

  return (
    <Button
      variant="outline"
      size="iconSm"
      className="bg-secondary hover:border-primary hover:text-primary"
      onClick={toggle}
      title="Theme wechseln"
      aria-label="Theme wechseln"
    >
      {mounted && dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
