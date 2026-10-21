"use client";

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
import type { Organization } from "@/lib/glitchtip/types";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function OrgSwitcher({
  orgs,
  active,
}: {
  orgs: Organization[];
  active: Organization | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function pick(slug: string) {
    startTransition(async () => {
      await fetch("/api/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      router.refresh();
    });
  }

  if (!orgs.length) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Building2 className="h-4 w-4" />
        No organizations
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" className="min-w-0 max-w-[180px] gap-2 sm:max-w-none" disabled={pending} />}
      >
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">{active?.name ?? "Select org"}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs">Organizations</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {orgs.map((o) => (
          <DropdownMenuItem key={o.id} onClick={() => pick(o.slug)} className="gap-2">
            <span className="flex-1 truncate">{o.name}</span>
            {active?.slug === o.slug && <Check className="h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
