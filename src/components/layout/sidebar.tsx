"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  AlertTriangle,
  FolderKanban,
  Bell,
  Users,
  Activity,
  Gauge,
  ScrollText,
  Settings,
  Tag,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandTile } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/issues", label: "Issues", icon: AlertTriangle },
  { href: "/performance", label: "Performance", icon: Gauge },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/releases", label: "Releases", icon: Tag },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/uptime", label: "Uptime", icon: Activity },
  { href: "/logs", label: "Logs", icon: ScrollText },
  { href: "/teams", label: "Teams", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
      {ITEMS.map((it) => {
        const active = it.exact
          ? pathname === it.href
          : pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
            )}
          >
            <it.icon className="h-4 w-4" />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

function BrandHeader() {
  return (
    <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
      <BrandTile />
      <span className="text-sm font-semibold tracking-tight">GlitchLens</span>
    </div>
  );
}

function Footer() {
  return (
    <div className="border-t border-border p-3 text-[11px] text-muted-foreground">
      <div className="px-2">Powered by GlitchTip</div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
      <BrandHeader />
      <NavList />
      <Footer />
    </aside>
  );
}

export function MobileNavTrigger() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 md:hidden"
            aria-label="Open menu"
          />
        }
      >
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent
        side="left"
        className="flex w-72 max-w-[85vw] flex-col bg-sidebar p-0 text-sidebar-foreground [padding-top:env(safe-area-inset-top)] [padding-bottom:env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
        </SheetHeader>
        <BrandHeader />
        <NavList onNavigate={() => setOpen(false)} />
        <Footer />
      </SheetContent>
    </Sheet>
  );
}
