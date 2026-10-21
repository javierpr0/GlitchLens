"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Building2, Server, User, Users } from "lucide-react";

const NAV = [
  { href: "/settings/account", label: "Account", icon: User },
  { href: "/settings/organization", label: "Organization", icon: Building2 },
  { href: "/settings/instances", label: "Instances", icon: Server, admin: true },
  { href: "/settings/users", label: "Users", icon: Users, admin: true },
];

export function SettingsNav({ isSuperadmin }: { isSuperadmin: boolean }) {
  const pathname = usePathname();
  return (
    <aside className="space-y-1 lg:block">
      <h2 className="hidden px-2 pb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground lg:block">
        Settings
      </h2>
      <div className="-mx-3 flex gap-1 overflow-x-auto px-3 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
        {NAV.filter((it) => !it.admin || isSuperadmin).map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + "/");
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors lg:px-2 lg:py-1.5",
                active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <it.icon className="h-3.5 w-3.5" />
              {it.label}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
