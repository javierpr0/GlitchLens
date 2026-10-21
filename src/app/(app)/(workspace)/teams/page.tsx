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

  const [members, teams] = await Promise.all([
    api.members(org).catch(() => []),
    api.teams(org).catch(() => []),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <PageHeader
          title="Members"
          description={`${members.length} member${members.length === 1 ? "" : "s"} in this organization.`}
          actions={<InviteMember orgSlug={org} />}
        />
        <Card>
          <CardContent className="p-0">
            <MembersList orgSlug={org} members={members} />
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
