"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Check, EyeOff, GitMerge, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

export function BulkActionsBar({
  selected,
  onClear,
}: {
  selected: string[];
  onClear: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function bulkUpdate(status: "resolved" | "ignored" | "unresolved") {
    if (!selected.length) return;
    startTransition(async () => {
      const qs = selected.map((id) => `id=${encodeURIComponent(id)}`).join("&");
      const res = await fetch(`/api/glitchtip/organizations/${await getOrgSlug()}/issues?${qs}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        toast.error("Bulk update failed.");
        return;
      }
      toast.success(`${selected.length} issue${selected.length === 1 ? "" : "s"} marked ${status}.`);
      onClear();
      router.refresh();
    });
  }

  function bulkDelete() {
    if (!selected.length) return;
    if (!confirm(`Delete ${selected.length} issue${selected.length === 1 ? "" : "s"}?`)) return;
    startTransition(async () => {
      const qs = selected.map((id) => `id=${encodeURIComponent(id)}`).join("&");
      const res = await fetch(`/api/glitchtip/organizations/${await getOrgSlug()}/issues?${qs}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Bulk delete failed.");
        return;
      }
      toast.success(`${selected.length} issue${selected.length === 1 ? "" : "s"} deleted.`);
      onClear();
      router.refresh();
    });
  }

  function bulkMerge() {
    if (selected.length < 2) return;
    if (
      !confirm(
        `Merge ${selected.length} issues into one? Their events and counts will be combined and the original issues will be removed.`,
      )
    )
      return;
    startTransition(async () => {
      const qs = selected.map((id) => `id=${encodeURIComponent(id)}`).join("&");
      const res = await fetch(`/api/glitchtip/organizations/${await getOrgSlug()}/issues?${qs}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merge: true }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: unknown };
        const detail = typeof body.error === "string" ? body.error : `HTTP ${res.status}`;
        toast.error(`Merge failed: ${detail}`);
        return;
      }
      toast.success(`${selected.length} issues merged.`);
      onClear();
      router.refresh();
    });
  }

  if (!selected.length) return null;

  return (
    <div className="sticky top-14 z-20 -mx-2 mb-2 flex items-center gap-2 rounded-lg border border-border bg-card/95 px-3 py-2 backdrop-blur">
      <span className="text-xs">
        <span className="font-semibold">{selected.length}</span>{" "}
        <span className="text-muted-foreground">selected</span>
      </span>
      <div className="ml-2 flex items-center gap-1">
        <Button size="sm" variant="outline" onClick={() => bulkUpdate("resolved")} disabled={pending} className="gap-1.5">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Resolve
        </Button>
        <Button size="sm" variant="outline" onClick={() => bulkUpdate("ignored")} disabled={pending} className="gap-1.5">
          <EyeOff className="h-3.5 w-3.5" /> Ignore
        </Button>
        <Button size="sm" variant="outline" onClick={() => bulkUpdate("unresolved")} disabled={pending} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Unresolve
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={bulkMerge}
          disabled={pending || selected.length < 2}
          title={selected.length < 2 ? "Select at least 2 issues to merge" : "Merge selected issues"}
          className="gap-1.5"
        >
          <GitMerge className="h-3.5 w-3.5" /> Merge
        </Button>
        <Button size="sm" variant="outline" onClick={bulkDelete} disabled={pending} className="gap-1.5 text-red-400">
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </Button>
      </div>
      <Button size="sm" variant="ghost" onClick={onClear} className="ml-auto gap-1 text-muted-foreground">
        <X className="h-3.5 w-3.5" /> Clear
      </Button>
    </div>
  );
}

async function getOrgSlug(): Promise<string> {
  const res = await fetch("/api/active-org");
  const data = (await res.json()) as { slug: string | null };
  return data.slug ?? "";
}
