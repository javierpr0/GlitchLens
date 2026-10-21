"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Role } from "@/lib/users";

const ROLE_LABEL: Record<Role, string> = { superadmin: "Superadmin", member: "Member", viewer: "Viewer" };

export function UserMenu({ name, email, role }: { name: string; email: string; role: Role }) {
  const queryClient = useQueryClient();
  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    queryClient.clear();
    // Full reload on purpose: it discards every piece of client-side state from the signed-out session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }
  const initials =
    name
      .split(" ")
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || email.slice(0, 2).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" className="h-9 gap-2 px-2" />}
      >
        <Avatar className="h-7 w-7">
          <AvatarFallback className="text-[11px] bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 text-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="hidden text-sm sm:inline">{name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{name}</span>
              <span className="text-xs text-muted-foreground">{email}</span>
              <span className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{ROLE_LABEL[role]}</span>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} className="gap-2">
          <LogOut className="h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
