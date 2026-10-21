"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

export function ProjectActions({ orgSlug, projectSlug }: { orgSlug: string; projectSlug: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function destroy() {
    if (!confirm(`Delete project "${projectSlug}" and all its events? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await fetch(`/api/glitchtip/projects/${orgSlug}/${projectSlug}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Could not delete project.");
        return;
      }
      toast.success("Project deleted.");
      router.push("/projects");
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={pending} />}>
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled className="text-xs text-muted-foreground">
          More project settings in GlitchTip
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={destroy} className="gap-2 text-red-400 focus:text-red-400">
          <Trash2 className="h-3.5 w-3.5" /> Delete project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
