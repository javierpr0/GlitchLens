"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Member } from "@/lib/glitchtip/types";
import { relativeTime } from "@/lib/format";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

const ROLES = ["owner", "manager", "admin", "member"];

export function MembersList({ orgSlug, members }: { orgSlug: string; members: Member[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function changeRole(memberId: string, role: string) {
    startTransition(async () => {
      const res = await fetch(`/api/glitchtip/organizations/${orgSlug}/members/${memberId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, orgRole: role }),
      });
      if (!res.ok) {
        toast.error("Could not change role.");
        return;
      }
      toast.success(`Role changed to ${role}.`);
      router.refresh();
    });
  }

  function remove(memberId: string, name: string) {
    if (!confirm(`Remove ${name} from organization?`)) return;
    startTransition(async () => {
      const res = await fetch(`/api/glitchtip/organizations/${orgSlug}/members/${memberId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Could not remove member.");
        return;
      }
      toast.success(`${name} removed.`);
      router.refresh();
    });
  }

  if (members.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-muted-foreground">No members.</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {members.map((m) => {
        const name = m.user?.name || m.email;
        const initials =
          name.split(/[\s@.]/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
        return (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-[11px] bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{name}</span>
                {m.isOwner && <Badge variant="outline" className="text-[10px]">Owner</Badge>}
                {m.pending && (
                  <Badge variant="outline" className="text-[10px] text-amber-400">
                    Pending
                  </Badge>
                )}
              </div>
              <div className="truncate text-xs text-muted-foreground">{m.email}</div>
            </div>
            <Badge variant="outline" className="capitalize">{m.roleName}</Badge>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Joined {relativeTime(m.dateCreated)}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-sm" disabled={pending} />}
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {ROLES.filter((r) => r !== m.role).map((r) => (
                  <DropdownMenuItem key={r} onClick={() => changeRole(m.id, r)} className="capitalize">
                    Change to {r}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => remove(m.id, name)}
                  className="gap-2 text-red-400 focus:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        );
      })}
    </ul>
  );
}
