"use client";

import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { LogOut, Menu } from "lucide-react";
import { useMobileNav } from "@/components/layout/mobile-nav-context";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { roleLabel } from "@/lib/labels";
import type { Role } from "@prisma/client";

interface HeaderProps {
  user: {
    name?: string | null;
    email?: string | null;
    role: string;
  };
}

// Titel + Untertitel je Route (Redesign: Seitentitel wandert in den Header).
const TITLES: [prefix: string, title: string, sub: string][] = [
  ["/projects", "Projekte", "Veranstaltungen mit Planungs- und Berechnungszeitraum"],
  ["/calendar", "Kalender", "Timeline aller Buchungen"],
  ["/finances/quotes", "Angebote", "Erstellte Angebote und deren Status"],
  ["/finances/pending", "Zu fakturieren", "Abgeschlossene Projekte ohne Schlussrechnung"],
  ["/finances/invoices", "Rechnungen", "Rechnungen und Zahlungsstatus"],
  ["/finances/forecast", "Forecast", "Umsatzvorschau nach Monaten"],
  ["/finances", "Finanzen", "Angebote, Rechnungen und Forecast"],
  ["/customers", "Kunden", "Auftraggeber und Rechnungsadressen"],
  ["/material", "Material", "Geräte, Packeinheiten, Kabel und Lagerorte"],
  ["/devices", "Material", "Geräte, Packeinheiten, Kabel und Lagerorte"],
  ["/pack-units", "Material", "Geräte, Packeinheiten, Kabel und Lagerorte"],
  ["/services", "Personal & Transport", "Dienstleistungen und Zusatzkosten"],
  ["/persons", "Personalstamm", "Personen, Löhne und Einsatz-Links"],
  ["/users", "Benutzer", "Zugänge und Rollen verwalten"],
  ["/settings", "Einstellungen", "Firma, Nummernkreise und Dokumente"],
];

function usePageTitle(): { title: string; sub: string } {
  const pathname = usePathname();
  for (const [prefix, title, sub] of TITLES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return { title, sub };
  }
  return { title: "Dashboard", sub: "Übersicht über Material und laufende Projekte" };
}

export function Header({ user }: HeaderProps) {
  const { setOpen } = useMobileNav();
  const { title, sub } = usePageTitle();
  const initials = (user.name ?? user.email ?? "?")
    .split(/[\s@]/)
    .filter(Boolean)
    .map((s) => s[0]?.toUpperCase())
    .slice(0, 2)
    .join("");

  return (
    <header className="sticky top-0 z-30 flex h-[52px] shrink-0 items-center gap-3 border-b bg-sidebar px-4 sm:px-5">
      {/* Burger-Button — nur Mobile */}
      <Button
        variant="ghost"
        size="iconSm"
        className="lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Menü öffnen"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="min-w-0">
        <h1 className="truncate text-[15px] font-bold leading-tight tracking-tight text-foreground">
          {title}
        </h1>
        <p className="hidden truncate text-[11px] leading-tight text-muted-foreground sm:block">
          {sub}
        </p>
      </div>

      <div className="flex-1" />

      <ThemeToggle />
      <div className="hidden h-[26px] w-px bg-border sm:block" aria-hidden />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-auto gap-2 px-1.5 py-1">
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-xs font-semibold text-foreground">
                {user.name ?? user.email}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {roleLabel(user.role as Role)}
              </div>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-[7px] bg-primary text-xs font-bold text-primary-foreground">
              {initials || "U"}
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="text-xs font-normal text-muted-foreground">Angemeldet als</div>
            <div className="font-medium">{user.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
            <LogOut className="mr-2 h-4 w-4" /> Abmelden
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
