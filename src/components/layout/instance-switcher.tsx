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
import type { Instance } from "@/lib/instances";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Server } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

export function InstanceSwitcher({
  instances,
  activeId,
}: {
  instances: Instance[];
  activeId: number | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();

  if (!instances.length) return null;
  const active = instances.find((i) => i.id === activeId) ?? instances[0];

  function pick(id: number) {
    if (id === activeId) return;
    startTransition(async () => {
      const res = await fetch("/api/instance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        toast.error("Could not switch instance.");
        return;
      }
      // Cached data belongs to the previous instance: drop it all.
      queryClient.clear();
      router.refresh();
    });
  }

  if (instances.length === 1) {
    return (
      <div className="flex min-w-0 max-w-[160px] items-center gap-2 px-2 text-sm sm:max-w-[220px]">
        <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">{active.name}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" className="min-w-0 max-w-[160px] gap-2 sm:max-w-[240px]" disabled={pending} />}
      >
        <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">{active.name}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs">GlitchTip instances</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {instances.map((i) => (
          <DropdownMenuItem key={i.id} onClick={() => pick(i.id)} className="gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate">{i.name}</div>
              <div className="truncate text-[11px] text-muted-foreground">{i.baseUrl}</div>
            </div>
            {active.id === i.id && <Check className="h-3.5 w-3.5 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
