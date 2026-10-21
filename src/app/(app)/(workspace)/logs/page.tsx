import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { api } from "@/lib/glitchtip/api";
import { getActiveOrgSlug } from "@/lib/org";
import { absoluteTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ScrollText } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Logs" };
export const dynamic = "force-dynamic";

const LEVEL_COLOR: Record<string, string> = {
  TRACE: "text-zinc-500",
  DEBUG: "text-zinc-400",
  INFO: "text-sky-400",
  WARN: "text-amber-400",
  ERROR: "text-red-400",
  FATAL: "text-red-500",
};

export default async function LogsPage() {
  const org = await getActiveOrgSlug();
  if (!org)
    return (
      <EmptyState icon={ScrollText} title="No organization" description="Select an organization first." />
    );
  const logs = await api.logs(org).catch(() => []);
  return (
    <div>
      <PageHeader
        title="Logs"
        description={`${logs.length} most recent log entr${logs.length === 1 ? "y" : "ies"}.`}
      />
      {logs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No logs yet"
          description="Send structured logs from your app via the Sentry SDK to see them here."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <ul className="divide-y divide-border font-mono text-[12px]">
            {logs.map((l) => {
              const level = (l.severityText || "INFO").toUpperCase();
              return (
                <li key={l.id} className="flex items-start gap-3 px-4 py-2.5">
                  <span
                    className={cn(
                      "mt-0.5 w-12 shrink-0 text-[10px] font-semibold uppercase",
                      LEVEL_COLOR[level] ?? "text-muted-foreground",
                    )}
                    title={`severity ${l.severityNumber}`}
                  >
                    {level}
                  </span>
                  <span
                    className="w-32 shrink-0 text-[10px] text-muted-foreground"
                    title={absoluteTime(l.timestamp, "PPpp")}
                  >
                    {relativeTime(l.timestamp)}
                  </span>
                  <span className="min-w-0 flex-1 break-words text-foreground/90">{l.body}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
