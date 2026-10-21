"use client";

import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/platform-icon";
import type { Project } from "@/lib/glitchtip/types";
import type { TransactionGroup } from "@/lib/glitchtip/api";
import { compactNumber, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
// Sort buttons live in <PerformanceSort /> at page level so they remain visible on empty results.

function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(2)}s`;
  return `${(s / 60).toFixed(1)}m`;
}

function durationColor(ms: number): string {
  if (ms < 300) return "text-emerald-400";
  if (ms < 1000) return "text-sky-400";
  if (ms < 3000) return "text-amber-400";
  return "text-red-400";
}

const METHOD_COLOR: Record<string, string> = {
  GET: "bg-emerald-500/15 text-emerald-400",
  POST: "bg-sky-500/15 text-sky-400",
  PUT: "bg-amber-500/15 text-amber-400",
  PATCH: "bg-amber-500/15 text-amber-400",
  DELETE: "bg-red-500/15 text-red-400",
};

export function PerformanceTable({
  groups,
  projects,
  nextCursor,
  prevCursor,
}: {
  groups: TransactionGroup[];
  projects: Project[];
  nextCursor: string | null;
  prevCursor: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function goToCursor(cursor: string | null) {
    const next = new URLSearchParams(params.toString());
    if (cursor) next.set("cursor", cursor);
    else next.delete("cursor");
    router.push(`/performance?${next.toString()}`);
  }

  const projectById = new Map(projects.map((p) => [p.id, p]));

  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Transaction</th>
              <th className="hidden px-3 py-2.5 text-right font-medium md:table-cell">Count</th>
              <th className="px-3 py-2.5 text-right font-medium">Avg</th>
              <th className="hidden px-3 py-2.5 text-right font-medium md:table-cell">P50</th>
              <th className="px-3 py-2.5 text-right font-medium">P95</th>
              <th className="hidden px-3 py-2.5 text-right font-medium lg:table-cell">Error rate</th>
              <th className="hidden px-3 py-2.5 text-right font-medium lg:table-cell">Throughput</th>
              <th className="hidden whitespace-nowrap px-3 py-2.5 text-left font-medium xl:table-cell">Last seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {groups.map((g) => {
              const project = projectById.get(String(g.project));
              const errorPct = g.errorRate * 100;
              return (
                <tr key={g.id} className="group transition-colors hover:bg-muted/30">
                  <td className="w-full max-w-0 px-4 py-3">
                    <div className="flex items-start gap-2.5">
                      {g.method && (
                        <span
                          className={cn(
                            "mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase",
                            METHOD_COLOR[g.method] ?? "bg-zinc-500/15 text-zinc-400",
                          )}
                        >
                          {g.method}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-[13px] text-foreground">{g.transaction}</div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                          {project && (
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/40 px-1.5 py-0.5">
                              <PlatformIcon platform={project.platform} size={10} />
                              {project.name}
                            </span>
                          )}
                          <span className="font-mono text-muted-foreground/70">{g.op}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-3 py-3 text-right tabular-nums md:table-cell">
                    {compactNumber(g.count)}
                  </td>
                  <td className={cn("px-3 py-3 text-right tabular-nums", durationColor(g.avgDuration))}>
                    {formatMs(g.avgDuration)}
                  </td>
                  <td className="hidden px-3 py-3 text-right tabular-nums text-muted-foreground md:table-cell">
                    {formatMs(g.p50)}
                  </td>
                  <td className={cn("px-3 py-3 text-right tabular-nums", durationColor(g.p95))}>
                    {formatMs(g.p95)}
                  </td>
                  <td className="hidden px-3 py-3 text-right tabular-nums lg:table-cell">
                    <span
                      className={cn(
                        errorPct > 5
                          ? "text-red-400"
                          : errorPct > 1
                            ? "text-amber-400"
                            : "text-muted-foreground",
                      )}
                    >
                      {errorPct.toFixed(2)}%
                    </span>
                  </td>
                  <td className="hidden px-3 py-3 text-right tabular-nums text-muted-foreground lg:table-cell">
                    {g.throughput.toFixed(2)}/s
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-3 text-xs text-muted-foreground xl:table-cell">
                    {relativeTime(g.lastSeen)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          <div>{groups.length} on this page</div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" disabled={!prevCursor} onClick={() => goToCursor(prevCursor)}>
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" disabled={!nextCursor} onClick={() => goToCursor(nextCursor)}>
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
