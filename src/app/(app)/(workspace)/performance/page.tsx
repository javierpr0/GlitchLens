import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { PerformanceTable } from "@/components/performance/performance-table";
import { PerformanceSort } from "@/components/performance/performance-sort";
import { api } from "@/lib/glitchtip/api";
import { getActiveOrgSlug } from "@/lib/org";
import { Gauge } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Performance" };
export const dynamic = "force-dynamic";

interface SearchParams {
  cursor?: string;
  project?: string | string[];
  sort?: string;
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const org = await getActiveOrgSlug();
  if (!org) {
    return <EmptyState icon={Gauge} title="No organization" description="Select an organization first." />;
  }

  const rawProjects = Array.isArray(sp.project) ? sp.project : sp.project ? [sp.project] : undefined;
  const projectFilter = rawProjects ? Array.from(new Set(rawProjects)) : undefined;

  const [groups, projects] = await Promise.all([
    api.transactionGroups(org, {
      cursor: sp.cursor ?? null,
      project: projectFilter,
      sort: sp.sort ?? "-avg_duration",
      limit: 25,
    }).catch(() => ({ data: [], nextCursor: null, prevCursor: null, total: 0, maxHits: 0 })),
    api.organizationProjects(org).catch(() => []),
  ]);

  return (
    <div>
      <PageHeader
        title="Performance"
        description={`${groups.total.toLocaleString()} transaction${groups.total === 1 ? "" : "s"} tracked.`}
      />
      <PerformanceSort />
      {groups.data.length === 0 ? (
        <EmptyState
          icon={Gauge}
          title="No transactions yet"
          description="Enable performance monitoring in your Sentry SDK (set tracesSampleRate) to start capturing transactions."
        />
      ) : (
        <PerformanceTable
          groups={groups.data}
          projects={projects}
          nextCursor={groups.nextCursor}
          prevCursor={groups.prevCursor}
        />
      )}
    </div>
  );
}
