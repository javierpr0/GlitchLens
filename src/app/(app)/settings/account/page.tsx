import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AccountForms } from "@/components/settings/account-forms";
import { PersonalTokens } from "@/components/settings/personal-tokens";
import { TwoFactorCard } from "@/components/settings/two-factor-card";
import { isTwoFactorEnabled, recoveryCodesLeft } from "@/lib/twofactor";
import { SessionsList } from "@/components/settings/sessions-list";
import { getSessionHash, listSessions, requireUser } from "@/lib/auth";
import { instanceIdsWithUserToken, listInstancesForUser } from "@/lib/instances";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account" };

const ROLE_LABEL = { superadmin: "Superadmin", member: "Member", viewer: "Viewer" } as const;

export default async function AccountPage() {
  const user = await requireUser();
  const sessions = listSessions(user.id, await getSessionHash());
  const withToken = instanceIdsWithUserToken(user.id);
  const personal = listInstancesForUser(user)
    .filter((i) => i.tokenMode === "per_user")
    .map((i) => ({ id: i.id, name: i.name, baseUrl: i.baseUrl, hasToken: withToken.has(i.id) }));
  return (
    <div>
      <PageHeader title="Account" description="Your GlitchLens profile and password." />
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-xs text-muted-foreground">Email</span>
            <span>{user.email}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-xs text-muted-foreground">Role</span>
            <Badge variant="outline" className="text-[10px]">{ROLE_LABEL[user.role]}</Badge>
          </div>
          <AccountForms name={user.name} />
        </CardContent>
      </Card>
      <TwoFactorCard enabled={isTwoFactorEnabled(user.id)} recoveryLeft={recoveryCodesLeft(user.id)} />
      <PersonalTokens rows={personal} />
      <SessionsList sessions={sessions} />
    </div>
  );
}
