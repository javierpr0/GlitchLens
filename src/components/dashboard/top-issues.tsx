import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { compactNumber, levelColor, relativeTime } from "@/lib/format";
import type { Issue } from "@/lib/glitchtip/types";
import { cn } from "@/lib/utils";
import { ArrowUpRight, Flame } from "lucide-react";
import Link from "next/link";

export function TopIssues({ issues }: { issues: Issue[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-400" /> Hot issues
        </CardTitle>
        <Link
          href="/issues"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          View all <ArrowUpRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        <ol className="divide-y divide-border">
          {issues.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-muted-foreground">
              No open issues. Nice.
            </li>
          )}
          {issues.map((issue) => (
            <li key={issue.id}>
              <Link
                href={`/issues/${issue.id}`}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
              >
                <span
                  className={cn(
                    "mt-0.5 inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-semibold uppercase tracking-wider",
                    levelColor(issue.level),
                  )}
                >
                  {issue.level}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {issue.metadata?.type ?? issue.title}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {issue.project.name} · {relativeTime(issue.lastSeen)}
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div className="font-medium tabular-nums">{compactNumber(issue.count)}</div>
                  <div className="text-muted-foreground">events</div>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
