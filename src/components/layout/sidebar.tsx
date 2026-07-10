"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Boxes,
  Calendar,
  FolderKanban,
  Users,
  Settings,
  Building2,
  Truck,
  Receipt,
  TrendingUp,
  AlertCircle,
  FileText,
  X,
} from "lucide-react";
import { useMobileNav } from "@/components/layout/mobile-nav-context";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: Role[];
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

// Flache Navigation mit Abschnitts-Überschriften (Redesign):
// Hauptbereich · Finanzen · Stammdaten · Verwaltung
const SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/projects", label: "Projekte", icon: FolderKanban },
      { href: "/calendar", label: "Kalender", icon: Calendar },
    ],
  },
  {
    label: "Finanzen",
    items: [
      { href: "/finances/quotes", label: "Angebote", icon: FileText },
      { href: "/finances/pending", label: "Zu fakturieren", icon: AlertCircle },
      { href: "/finances/invoices", label: "Rechnungen", icon: Receipt },
      { href: "/finances/forecast", label: "Forecast", icon: TrendingUp },
    ],
  },
  {
    label: "Stammdaten",
    items: [
      { href: "/customers", label: "Kunden", icon: Building2 },
      { href: "/material", label: "Material", icon: Boxes },
      { href: "/services", label: "Personal & Transport", icon: Truck },
    ],
  },
  {
    items: [
      { href: "/users", label: "Benutzer", icon: Users, roles: ["ADMIN"] },
      { href: "/settings", label: "Einstellungen", icon: Settings, roles: ["ADMIN"] },
    ],
  },
];

export function CratelMark({ className }: { className?: string }) {
  return (
    <svg viewBox="8 12 84 76" fill="none" className={className} aria-hidden>
      <g
        className="stroke-foreground"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="16" y="20" width="68" height="60" rx="11" />
        <line x1="16" y1="40" x2="84" y2="40" />
        <rect x="37" y="57" width="26" height="10" rx="5" />
      </g>
      <g className="stroke-primary" strokeWidth="7" strokeLinecap="round">
        <line x1="30" y1="34" x2="30" y2="46" />
        <line x1="70" y1="34" x2="70" y2="46" />
      </g>
    </svg>
  );
}

function SidebarNav({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <nav className="flex flex-1 flex-col gap-px overflow-y-auto p-2">
      {SECTIONS.map((section, si) => {
        const items = section.items.filter((i) => !i.roles || i.roles.includes(role));
        if (items.length === 0) return null;
        return (
          <div key={section.label ?? si} className="flex flex-col gap-px">
            {si > 0 && <div className="mx-1.5 my-2 h-px bg-border" />}
            {section.label && (
              <div className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[.09em] text-faint">
                {section.label}
              </div>
            )}
            {items.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md border-l-[3px] px-2.5 py-1.5 text-[13px] transition-colors",
                    active
                      ? "border-primary bg-primary-subtle font-semibold text-primary"
                      : "border-transparent font-medium text-sidebar-foreground hover:bg-secondary"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

function SidebarLogo({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex h-[52px] shrink-0 items-center gap-2 border-b px-4">
      <CratelMark className="h-6 w-[26px] shrink-0" />
      <span className="text-[19px] font-extrabold tracking-tight text-foreground">Cratel</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground lg:hidden"
          aria-label="Menü schließen"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

function SidebarFooter() {
  return (
    <div className="flex items-center gap-2 border-t px-4 py-2.5 text-[11px] text-faint">
      <span className="h-[7px] w-[7px] rounded-full bg-success" aria-hidden />
      <span>System online</span>
    </div>
  );
}

export function Sidebar({ role }: { role: Role }) {
  const { open, setOpen } = useMobileNav();

  return (
    <>
      {/* Desktop-Sidebar: fest links, ab lg sichtbar */}
      <aside className="sticky top-0 z-10 hidden h-screen w-[216px] shrink-0 flex-col border-r bg-sidebar lg:flex">
        <SidebarLogo />
        <SidebarNav role={role} />
        <SidebarFooter />
      </aside>

      {/* Mobile-Drawer: Off-Canvas, gesteuert über den Burger-Button im Header */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-foreground/55"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          {/* Drawer */}
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-sidebar shadow-xl">
            <SidebarLogo onClose={() => setOpen(false)} />
            <SidebarNav role={role} onNavigate={() => setOpen(false)} />
            <SidebarFooter />
          </aside>
        </div>
      )}
    </>
  );
}
