import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { MembersList } from "@/components/teams/members-list";
import { TeamsGrid } from "@/components/teams/teams-grid";
import { InviteMember } from "@/components/teams/invite-member";
import { CreateTeam } from "@/components/teams/create-team";
import { api } from "@/lib/glitchtip/api";
import { getActiveOrgSlug } from "@/lib/org";
import { Users } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Teams" };
export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const org = await getActiveOrgSlug();
  if (!org)
    return (
      <EmptyState icon={Users} title="No organization" description="Select an organization first." />
    );

  // A failed request must not read as "no members": GlitchTip can error on this endpoint (for example 6.2.6 while an invitation is pending).
  const [membersResult, teams] = await Promise.all([
    Promise.allSettled([api.members(org)]).then(([r]) => r),
    api.teams(org).catch(() => []),
  ]);
  const membersFailed = membersResult.status === "rejected";
  const members = membersResult.status === "fulfilled" ? membersResult.value : [];

  return (
    <div className="space-y-8">
      <div>
        <PageHeader
          title="Members"
          description={membersFailed ? "Could not load members." : `${members.length} member${members.length === 1 ? "" : "s"} in this organization.`}
          actions={<InviteMember orgSlug={org} />}
        />
        <Card>
          <CardContent className="p-0">
            {membersFailed ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                GlitchTip returned an error when listing members, so the list is unavailable right now. Teams below are unaffected.
              </p>
            ) : (
              <MembersList orgSlug={org} members={members} />
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <PageHeader
          title="Teams"
          description={`${teams.length} team${teams.length === 1 ? "" : "s"}.`}
          actions={<CreateTeam orgSlug={org} />}
        />
        {teams.length === 0 ? (
          <EmptyState icon={Users} title="No teams" description="Create teams to group members and projects." />
        ) : (
          <TeamsGrid orgSlug={org} teams={teams} />
        )}
      </div>
    </div>
  );
}
