"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { IssueStatus } from "@/lib/glitchtip/types";
import { safeHttpUrl } from "@/lib/utils";
import { Check, ChevronDown, ExternalLink, EyeOff, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

export function IssueActions({
  issueId,
  status,
  permalink,
}: {
  issueId: string;
  status: IssueStatus;
  permalink: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function update(next: IssueStatus) {
    startTransition(async () => {
      const res = await fetch(`/api/glitchtip/issues/${issueId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(`Failed to update issue: ${(body as { error?: string }).error ?? res.statusText}`);
        return;
      }
      toast.success(`Issue marked as ${next}.`);
      router.refresh();
    });
  }

  function destroy() {
    startTransition(async () => {
      const res = await fetch(`/api/glitchtip/issues/${issueId}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to delete issue.");
        return;
      }
      toast.success("Issue deleted.");
      router.push("/issues");
    });
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="default"
        size="sm"
        disabled={pending || status === "resolved"}
        onClick={() => update("resolved")}
        className="gap-1.5"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        Resolve
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="sm" disabled={pending} aria-label="More issue actions" />}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => update("ignored")} className="gap-2">
            <EyeOff className="h-3.5 w-3.5" /> Ignore
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => update("unresolved")} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" /> Mark unresolved
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              const url = safeHttpUrl(permalink);
              if (url) window.open(url, "_blank", "noopener,noreferrer");
            }}
            className="gap-2"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open in GlitchTip
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={destroy} className="gap-2 text-red-400 focus:text-red-400">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
