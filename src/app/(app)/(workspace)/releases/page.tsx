import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, GlitchTipError } from "@/lib/glitchtip/api";
import { getActiveOrgSlug } from "@/lib/org";
import { compactNumber, relativeTime } from "@/lib/format";
import { GitBranch, Lock, Tag } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Releases" };
export const dynamic = "force-dynamic";

export default async function ReleasesPage() {
  const org = await getActiveOrgSlug();
  if (!org)
    return (
      <EmptyState icon={Tag} title="No organization" description="Select an organization first." />
    );

  let releases = null;
  let permissionDenied = false;
  try {
    releases = await api.releases(org);
  } catch (e) {
    if (e instanceof GlitchTipError && e.status === 403) permissionDenied = true;
    else throw e;
  }

  if (permissionDenied) {
    return (
      <div>
        <PageHeader title="Releases" />
        <EmptyState
          icon={Lock}
          title="Releases require a logged-in session"
          description="The Releases endpoint isn't accessible with personal API tokens. Sign in with email + password to view release data."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Releases"
        description={`${releases?.length ?? 0} release${releases?.length === 1 ? "" : "s"} tracked.`}
      />
      {!releases?.length ? (
        <EmptyState
          icon={Tag}
          title="No releases yet"
          description="Releases let you correlate errors with deployments. Use the Sentry CLI release commands to start tracking."
        />
      ) : (
        <div className="space-y-3">
          {releases.map((r) => (
            <Card key={r.version}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Tag className="h-3.5 w-3.5 text-violet-400" />
                      <span className="font-mono text-sm font-medium">{r.shortVersion ?? r.version}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Created {relativeTime(r.dateCreated)}
                      {r.dateReleased && ` · Released ${relativeTime(r.dateReleased)}`}
                    </div>
                    {r.projects?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {r.projects.map((p) => (
                          <Badge key={p.slug} variant="outline" className="text-[10px]">
                            {p.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3 text-xs">
                    <Stat label="New issues" value={compactNumber(r.newGroups)} />
                    <Stat label="Commits" value={compactNumber(r.commitCount)} icon={GitBranch} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="text-right">
      <div className="font-semibold tabular-nums">{value}</div>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {Icon && <Icon className="h-2.5 w-2.5" />}
        {label}
      </div>
    </div>
  );
}
