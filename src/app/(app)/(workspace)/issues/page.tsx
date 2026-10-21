import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { AutoRefresh } from "@/components/issues/auto-refresh";
import { IssueFilters } from "@/components/issues/issue-filters";
import { IssuesTable } from "@/components/issues/issues-table";
import { api } from "@/lib/glitchtip/api";
import { getActiveOrgSlug } from "@/lib/org";
import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Issues" };
export const dynamic = "force-dynamic";

interface SearchParams {
  cursor?: string;
  query?: string;
  project?: string | string[];
  environment?: string;
  statsPeriod?: string;
  sort?: string;
}

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  // Defensive dedupe in case the URL gets polluted with repeated values.
  const rawProjects = Array.isArray(sp.project)
    ? sp.project
    : sp.project
      ? [sp.project]
      : undefined;
  const projectFilter = rawProjects ? Array.from(new Set(rawProjects)) : undefined;
  const org = await getActiveOrgSlug();

  if (!org) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="No organization selected"
        description="Select or create an organization to start tracking issues."
      />
    );
  }

  // Sentry default: when `query` is absent from the URL, filter to unresolved.
  // Empty string explicitly means "All" (user picked it).
  const queryToSend =
    typeof sp.query === "string"
      ? sp.query || undefined
      : "is:unresolved";

  const [issues, projects] = await Promise.all([
    api.issues(org, {
      cursor: sp.cursor ?? null,
      query: queryToSend,
      project: projectFilter,
      environment: sp.environment,
      statsPeriod: sp.statsPeriod ?? "14d",
      sort: sp.sort,
      limit: 25,
    }),
    api.organizationProjects(org).catch(() => []),
  ]);

  return (
    <div>
      <PageHeader
        title="Issues"
        description={`${issues.total.toLocaleString()} total issues across ${projects.length} project${projects.length === 1 ? "" : "s"}.`}
        actions={<AutoRefresh />}
      />
      <IssueFilters projects={projects} />
      <div className="mt-4">
        <IssuesTable
          issues={issues.data}
          nextCursor={issues.nextCursor}
          prevCursor={issues.prevCursor}
        />
      </div>
    </div>
  );
}
