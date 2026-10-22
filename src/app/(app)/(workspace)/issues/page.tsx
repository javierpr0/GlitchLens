import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { AutoRefresh } from "@/components/issues/auto-refresh";
import { IssueFilters } from "@/components/issues/issue-filters";
import { IssuesTable } from "@/components/issues/issues-table";
import { api } from "@/lib/glitchtip/api";
import { toIssueListFilter, type IssueSearchParams } from "@/lib/issues-filter";
import { getActiveOrgSlug } from "@/lib/org";
import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Issues" };
export const dynamic = "force-dynamic";

interface SearchParams extends IssueSearchParams {
  cursor?: string;
}

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const filter = toIssueListFilter(sp);
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

  const [issues, projects] = await Promise.all([
    api.issues(org, { ...filter, cursor: sp.cursor ?? null, limit: 25 }),
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
          total={issues.total}
        />
      </div>
    </div>
  );
}
