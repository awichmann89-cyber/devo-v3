"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
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
  Database,
  ChevronDown,
  ChevronRight,
  Wallet,
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

interface NavGroup {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: Role[];
  children: NavItem[];
}

type NavEntry = NavItem | NavGroup;

function isGroup(e: NavEntry): e is NavGroup {
  return "children" in e;
}

const NAV: NavEntry[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projekte", icon: FolderKanban },
  { href: "/calendar", label: "Kalender", icon: Calendar },
  {
    label: "Finanzen",
    icon: Wallet,
    children: [
      { href: "/finances/quotes", label: "Angebote", icon: FileText },
      { href: "/finances/pending", label: "Zu fakturieren", icon: AlertCircle },
      { href: "/finances/invoices", label: "Rechnungen", icon: Receipt },
      { href: "/finances/forecast", label: "Forecast", icon: TrendingUp },
    ],
  },
  {
    label: "Stammdaten",
    icon: Database,
    children: [
      { href: "/customers", label: "Kunden", icon: Building2 },
      { href: "/material", label: "Material", icon: Boxes },
      { href: "/services", label: "Personal & Transport", icon: Truck },
    ],
  },
  { href: "/users", label: "Benutzer", icon: Users, roles: ["ADMIN"] },
  { href: "/settings", label: "Einstellungen", icon: Settings, roles: ["ADMIN"] },
];

function SidebarNav({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();

  const initiallyOpen = new Set<string>();
  for (const entry of NAV) {
    if (isGroup(entry)) {
      const anyActive = entry.children.some(
        (c) => pathname === c.href || pathname.startsWith(c.href + "/")
      );
      if (anyActive) initiallyOpen.add(entry.label);
    }
  }
  const [open, setOpen] = useState<Set<string>>(initiallyOpen);

  function toggle(label: string) {
    const s = new Set(open);
    if (s.has(label)) s.delete(label);
    else s.add(label);
    setOpen(s);
  }

  function visibleChildren(g: NavGroup) {
    return g.children.filter((c) => !c.roles || c.roles.includes(role));
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <nav className="space-y-1 p-4">
      {NAV.filter((entry) => !entry.roles || entry.roles.includes(role)).map((entry) => {
        if (!isGroup(entry)) {
          const active = isActive(entry.href);
          const Icon = entry.icon;
          return (
            <Link
              key={entry.href}
              href={entry.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {entry.label}
            </Link>
          );
        }
        const children = visibleChildren(entry);
        if (children.length === 0) return null;
        const isOpen = open.has(entry.label);
        const hasActiveChild = children.some((c) => isActive(c.href));
        const Icon = entry.icon;
        return (
          <div key={entry.label}>
            <button
              type="button"
              onClick={() => toggle(entry.label)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                hasActiveChild && !isOpen
                  ? "bg-secondary/60 text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1 text-left">{entry.label}</span>
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {isOpen && (
              <div className="mt-1 ml-3 space-y-1 border-l pl-3">
                {children.map((child) => {
                  const active = isActive(child.href);
                  const ChildIcon = child.icon;
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-secondary text-secondary-foreground font-medium"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <ChildIcon className="h-4 w-4" />
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function SidebarLogo({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex h-16 items-center justify-between gap-2 border-b px-5">
      <Image
        src="/cratel_logo.svg"
        alt="Cratel"
        width={200}
        height={60}
        priority
        className="h-9 w-auto"
      />
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground lg:hidden"
          aria-label="Menü schließen"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

export function Sidebar({ role }: { role: Role }) {
  const { open, setOpen } = useMobileNav();

  return (
    <>
      {/* Desktop-Sidebar: fest links, ab lg sichtbar */}
      <aside className="hidden w-64 shrink-0 border-r bg-card lg:block">
        <SidebarLogo />
        <SidebarNav role={role} />
      </aside>

      {/* Mobile-Drawer: Off-Canvas, gesteuert über den Burger-Button im Header */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          {/* Drawer */}
          <aside className="relative h-full w-72 max-w-[85vw] bg-card shadow-xl">
            <SidebarLogo onClose={() => setOpen(false)} />
            <div className="overflow-y-auto">
              <SidebarNav role={role} onNavigate={() => setOpen(false)} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
