import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { EventsChart } from "@/components/dashboard/events-chart-lazy";
import { TopIssues } from "@/components/dashboard/top-issues";
import { TopProjects } from "@/components/dashboard/top-projects";
import { api } from "@/lib/glitchtip/api";
import { getActiveOrgSlug } from "@/lib/org";
import { Inbox } from "lucide-react";

export const dynamic = "force-dynamic";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

export default async function DashboardPage() {
  const org = await getActiveOrgSlug();
  if (!org) {
    return (
      <EmptyState
        icon={Inbox}
        title="No organization yet"
        description="Create or join an organization in your GlitchTip instance to get started."
      />
    );
  }

  const start = isoDaysAgo(14);
  const end = new Date().toISOString();

  const [issues, projects, statsByInterval] = await Promise.all([
    // No statsPeriod → `total` (x-hits) counts all open issues, matching the "Open issues" KPI.
    api.issues(org, { limit: 5, query: "is:unresolved" }).catch(() => null),
    api.organizationProjects(org).catch(() => []),
    api.stats(org, { category: "error", start, end, interval: "1d" }).catch(() => null),
  ]);

  // stats_v2 on this instance returns a single group with `series["sum(quantity)"]: number[]`,
  // no `by` field, no `totals`. Sum the series for the global event count.
  const intervals = statsByInterval?.intervals ?? [];
  const groups = statsByInterval?.groups ?? [];
  const totalEvents14d = groups.reduce((acc, g) => {
    const series = (g?.series ?? {}) as Record<string, Array<number | null>>;
    const arr = series["sum(quantity)"] ?? Object.values(series)[0] ?? [];
    return acc + arr.reduce((a: number, v) => a + (Number(v) || 0), 0);
  }, 0);

  const acceptingProjects = projects.filter((p) => p.firstEvent != null).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Overview"
        description={`What's happening across your projects in the last 14 days.`}
      />

      <KpiCards
        totalIssues={issues?.total ?? 0}
        totalEvents={totalEvents14d}
        projectCount={projects.length}
        activeProjects={acceptingProjects}
      />

      <EventsChart intervals={intervals} groups={groups} />

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <TopIssues issues={issues?.data ?? []} />
        <TopProjects projects={projects} orgSlug={org} />
      </div>
    </div>
  );
}
