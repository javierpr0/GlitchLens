import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/glitchtip/api";
import { getActiveOrgSlug } from "@/lib/org";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Activity, CheckCircle2, XCircle } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Uptime" };
export const dynamic = "force-dynamic";

export default async function UptimePage() {
  const org = await getActiveOrgSlug();
  if (!org)
    return (
      <EmptyState icon={Activity} title="No organization" description="Select an organization first." />
    );

  const monitors = await api.monitors(org).catch(() => []);

  return (
    <div>
      <PageHeader
        title="Uptime"
        description={`${monitors.length} monitor${monitors.length === 1 ? "" : "s"} configured.`}
      />
      {monitors.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No uptime monitors"
          description="Add monitors in your GlitchTip settings to track service availability."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {monitors.map((m, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{m.projectName}</div>
                    {m.envName && (
                      <div className="text-xs text-muted-foreground">{m.envName}</div>
                    )}
                  </div>
                  <div className={cn("flex items-center gap-1.5 text-xs font-medium", m.isUp ? "text-emerald-400" : "text-red-400")}>
                    {m.isUp ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    {m.isUp ? "Up" : "Down"}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mb-2">
                  Last status change {relativeTime(m.lastChange)}
                </div>
                <div className="flex h-8 items-end gap-0.5">
                  {[...m.checks].reverse().slice(-60).map((c, j) => (
                    <div
                      key={j}
                      title={`${c.isUp ? "Up" : "Down"} · ${new Date(c.startCheck).toLocaleString()}`}
                      className={cn(
                        "h-full flex-1 rounded-sm",
                        c.isUp ? "bg-emerald-500/60" : "bg-red-500/70",
                      )}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
