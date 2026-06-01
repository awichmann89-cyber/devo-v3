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
  PackageOpen,
  Settings,
  Building2,
  Truck,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: Role[];
}

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projekte", icon: FolderKanban },
  { href: "/customers", label: "Kunden", icon: Building2 },
  { href: "/calendar", label: "Kalender", icon: Calendar },
  { href: "/material", label: "Material", icon: Boxes },
  { href: "/services", label: "Personal & Transport", icon: Truck },
  { href: "/users", label: "Benutzer", icon: Users, roles: ["ADMIN"] },
  { href: "/settings", label: "Einstellungen", icon: Settings, roles: ["ADMIN"] },
];

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r bg-card lg:block">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <PackageOpen className="h-6 w-6" />
        <span className="text-lg font-semibold">Devo</span>
      </div>
      <nav className="space-y-1 p-4">
        {NAV.filter((item) => !item.roles || item.roles.includes(role)).map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
