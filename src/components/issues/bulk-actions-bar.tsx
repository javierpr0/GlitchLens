"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, EyeOff, GitMerge, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

export interface AllMatchingSelection {
  count: number;
  capped: boolean;
  filters: Record<string, unknown>;
}

export function BulkActionsBar({
  selected,
  allMatching,
  onClear,
}: {
  selected: string[];
  /** When set, actions apply to every issue matching the search instead of the checked rows. */
  allMatching: AllMatchingSelection | null;
  onClear: () => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [typed, setTyped] = useState("");

  /** Runs an action on every issue matching the search. The server recounts and refuses if the number changed. */
  function bulkAll(action: "delete" | "resolved" | "ignored" | "unresolved") {
    if (!allMatching) return;
    startTransition(async () => {
      const res = await fetch("/api/issues/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, filters: allMatching.filters, expectedCount: allMatching.count }),
      });
      const data = (await res.json().catch(() => ({}))) as { affected?: number; error?: string };
      if (!res.ok) {
        toast.error(
          `${data.error ?? "The bulk action failed."}${typeof data.affected === "number" ? ` ${data.affected.toLocaleString()} were already processed.` : ""}`,
        );
        router.refresh();
        return;
      }
      const n = (data.affected ?? allMatching.count).toLocaleString();
      toast.success(action === "delete" ? `${n} issues deleted.` : `${n} issues marked ${action}.`);
      setDeleteOpen(false);
      setTyped("");
      onClear();
      // The page cursor we were on may no longer exist: start again from the first page of this search.
      if (params.has("cursor")) {
        const next = new URLSearchParams(params.toString());
        next.delete("cursor");
        router.replace(`/issues?${next.toString()}`);
      }
      router.refresh();
    });
  }

  function bulkUpdate(status: "resolved" | "ignored" | "unresolved") {
    if (allMatching) {
      if (confirm(`Mark all ${allMatching.count.toLocaleString()} matching issues as ${status}?`)) bulkAll(status);
      return;
    }
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
    if (allMatching) {
      setDeleteOpen(true);
      return;
    }
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

  if (!selected.length && !allMatching) return null;

  const count = allMatching ? allMatching.count : selected.length;

  return (
    <div className="sticky top-14 z-20 -mx-2 mb-2 flex items-center gap-2 rounded-lg border border-border bg-card/95 px-3 py-2 backdrop-blur">
      <span className="text-xs">
        <span className="font-semibold">{count.toLocaleString()}{allMatching?.capped ? "+" : ""}</span>{" "}
        <span className="text-muted-foreground">{allMatching ? "selected (all pages)" : "selected"}</span>
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
          disabled={pending || !!allMatching || selected.length < 2}
          title={allMatching ? "Merge works on the issues checked on this page" : selected.length < 2 ? "Select at least 2 issues to merge" : "Merge selected issues"}
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
      <Dialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setTyped(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {allMatching?.count.toLocaleString()}{allMatching?.capped ? "+" : ""} issues?</DialogTitle>
            <DialogDescription>
              This permanently deletes every issue matching the current search, across all pages, together with their
              events. It cannot be undone. {allMatching?.capped ? "Only the first 10,000 are deleted per action: run it again for the rest. " : ""}
              Type <span className="font-mono font-semibold text-foreground">DELETE</span> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" autoComplete="off" className="bg-background font-mono" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={pending || typed !== "DELETE"} onClick={() => bulkAll("delete")} className="gap-1.5">
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Delete everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

async function getOrgSlug(): Promise<string> {
  const res = await fetch("/api/active-org");
  const data = (await res.json()) as { slug: string | null };
  return data.slug ?? "";
}
