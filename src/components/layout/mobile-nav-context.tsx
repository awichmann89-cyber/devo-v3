"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface Ctx {
  open: boolean;
  setOpen: (v: boolean) => void;
}

const MobileNavContext = createContext<Ctx | null>(null);

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Nach einem Klick auf einen Link in der Mobile-Sidebar soll diese
  // automatisch geschlossen werden.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  return (
    <MobileNavContext.Provider value={{ open, setOpen }}>
      {children}
    </MobileNavContext.Provider>
  );
}

export function useMobileNav(): Ctx {
  const ctx = useContext(MobileNavContext);
  if (!ctx) throw new Error("useMobileNav must be inside MobileNavProvider");
  return ctx;
}
