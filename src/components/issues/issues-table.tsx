"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Issue } from "@/lib/glitchtip/types";
import { compactNumber, levelColor, relativeTime } from "@/lib/format";
import { PlatformIcon } from "@/components/platform-icon";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Inbox, Loader2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { BulkActionsBar } from "@/components/issues/bulk-actions-bar";

/** The filters currently in the URL, in the shape the bulk endpoint expects. */
function filtersFrom(params: URLSearchParams) {
  const projects = params.getAll("project");
  return {
    ...(params.has("query") ? { query: params.get("query") ?? "" } : {}),
    ...(projects.length ? { project: projects } : {}),
    ...(params.get("environment") ? { environment: params.get("environment")! } : {}),
    ...(params.get("statsPeriod") ? { statsPeriod: params.get("statsPeriod")! } : {}),
    ...(params.get("sort") ? { sort: params.get("sort")! } : {}),
  };
}

/** Selection that spans every page of the current search, not just the rows on screen. */
export interface AllMatching {
  key: string;
  count: number;
  capped: boolean;
}

export function IssuesTable({
  issues,
  nextCursor,
  prevCursor,
  total,
}: {
  issues: Issue[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatchingState, setAllMatching] = useState<AllMatching | null>(null);
  const [counting, setCounting] = useState(false);
  // The URL (without the page cursor) identifies the search: a different search invalidates the selection.
  const searchKey = (() => {
    const p = new URLSearchParams(params.toString());
    p.delete("cursor");
    return p.toString();
  })();
  const allMatching = allMatchingState?.key === searchKey ? allMatchingState : null;

  async function selectAllMatching() {
    setCounting(true);
    try {
      const res = await fetch("/api/issues/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "count", filters: filtersFrom(params) }),
      });
      const data = (await res.json().catch(() => ({}))) as { count?: number; capped?: boolean; error?: string };
      if (!res.ok || typeof data.count !== "number") {
        toast.error(data.error ?? "Could not count the matching issues.");
        return;
      }
      setAllMatching({ key: searchKey, count: data.count, capped: !!data.capped });
    } finally {
      setCounting(false);
    }
  }

  function goToCursor(cursor: string | null) {
    const next = new URLSearchParams(params.toString());
    if (cursor) next.set("cursor", cursor);
    else next.delete("cursor");
    setSelected(new Set());
    // Going to another page keeps an "all matching" selection: that is the point of it.
    router.push(`/issues?${next.toString()}`);
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setAllMatching(null);
    if (selected.size === issues.length) setSelected(new Set());
    else setSelected(new Set(issues.map((i) => i.id)));
  }

  function clearAll() {
    setSelected(new Set());
    setAllMatching(null);
  }

  if (!issues.length) {
    return (
      <EmptyState
        icon={Inbox}
        title="No issues found"
        description="Either everything is healthy or your filters are too narrow."
      />
    );
  }

  const allChecked = selected.size > 0 && selected.size === issues.length;
  const someChecked = selected.size > 0 && selected.size < issues.length;

  return (
    <div>
      <BulkActionsBar
        selected={Array.from(selected)}
        allMatching={allMatching ? { ...allMatching, filters: filtersFrom(params) } : null}
        onClear={clearAll}
      />

      {allChecked && total > issues.length && (
        <div className="mb-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
          {allMatching ? (
            <>
              <span>
                All <span className="font-semibold">{allMatching.count.toLocaleString()}{allMatching.capped ? "+" : ""}</span> issues matching this search are
                selected{allMatching.capped ? " (the first 10,000)" : ""}.
              </span>
              <button type="button" onClick={clearAll} className="font-medium text-primary hover:underline">
                Clear selection
              </button>
            </>
          ) : (
            <>
              <span>All {issues.length} issues on this page are selected.</span>
              <button
                type="button"
                onClick={selectAllMatching}
                disabled={counting}
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline disabled:opacity-60"
              >
                {counting && <Loader2 className="h-3 w-3 animate-spin" />}
                Select all {total.toLocaleString()} issues matching this search
              </button>
            </>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="w-full overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="hidden w-10 px-3 py-2.5 sm:table-cell">
                <Checkbox
                  checked={allChecked}
                  indeterminate={someChecked}
                  onCheckedChange={toggleAll}
                />
              </th>
              <th className="px-2 py-2.5 text-left font-medium sm:px-3">Issue</th>
              <th className="hidden px-3 py-2.5 text-right font-medium md:table-cell">Events</th>
              <th className="hidden px-3 py-2.5 text-right font-medium md:table-cell">Users</th>
              <th className="hidden px-3 py-2.5 text-left font-medium lg:table-cell">First seen</th>
              <th className="hidden whitespace-nowrap px-3 py-2.5 text-left font-medium sm:table-cell">Last seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {issues.map((issue) => {
              const checked = selected.has(issue.id);
              return (
                <tr
                  key={issue.id}
                  className={cn(
                    "group transition-colors hover:bg-muted/30",
                    checked && "bg-violet-500/5",
                  )}
                >
                  <td className="hidden px-3 py-3 sm:table-cell">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(issue.id)}
                    />
                  </td>
                  <td className="w-full max-w-0 px-2 py-3 sm:px-3">
                    <div className="flex items-start gap-2 sm:gap-3">
                      <span
                        className={cn(
                          "mt-1 inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-semibold uppercase tracking-wider",
                          levelColor(issue.level),
                        )}
                      >
                        {issue.level}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/issues/${issue.id}`}
                          className="block truncate font-medium text-foreground hover:text-primary"
                        >
                          {issue.metadata?.type ?? issue.title}
                        </Link>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {issue.metadata?.value || issue.title}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/40 px-1.5 py-0.5">
                            <PlatformIcon platform={issue.project.platform} size={11} />
                            <span className="max-w-[120px] truncate">{issue.project.name}</span>
                          </span>
                          {issue.shortId && (
                            <span className="font-mono text-[10px] text-muted-foreground/70">{issue.shortId}</span>
                          )}
                          {issue.status !== "unresolved" && (
                            <Badge variant="outline" className="h-4 px-1.5 text-[10px] capitalize">
                              {issue.status}
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground/70 sm:hidden">
                            {compactNumber(issue.count)} events · {relativeTime(issue.lastSeen)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-3 py-3 text-right tabular-nums md:table-cell">
                    {compactNumber(issue.count)}
                  </td>
                  <td className="hidden px-3 py-3 text-right tabular-nums md:table-cell">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {compactNumber(issue.userCount)}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-3 text-xs text-muted-foreground lg:table-cell">
                    {relativeTime(issue.firstSeen)}
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-3 text-xs text-muted-foreground sm:table-cell">
                    {relativeTime(issue.lastSeen)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          <div>{issues.length} on this page</div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2"
              disabled={!prevCursor}
              onClick={() => goToCursor(prevCursor)}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2"
              disabled={!nextCursor}
              onClick={() => goToCursor(nextCursor)}
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
