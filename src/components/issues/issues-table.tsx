"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Issue } from "@/lib/glitchtip/types";
import { compactNumber, levelColor, relativeTime } from "@/lib/format";
import { PlatformIcon } from "@/components/platform-icon";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Inbox, Users } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { BulkActionsBar } from "@/components/issues/bulk-actions-bar";

export function IssuesTable({
  issues,
  nextCursor,
  prevCursor,
}: {
  issues: Issue[];
  nextCursor: string | null;
  prevCursor: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function goToCursor(cursor: string | null) {
    const next = new URLSearchParams(params.toString());
    if (cursor) next.set("cursor", cursor);
    else next.delete("cursor");
    setSelected(new Set());
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
    if (selected.size === issues.length) setSelected(new Set());
    else setSelected(new Set(issues.map((i) => i.id)));
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
      <BulkActionsBar selected={Array.from(selected)} onClear={() => setSelected(new Set())} />

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
