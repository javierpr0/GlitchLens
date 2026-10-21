import { PageHeader } from "@/components/page-header";
import { TwoFactorPolicyCard } from "@/components/settings/two-factor-policy";
import { UsersManager } from "@/components/settings/users-manager";
import { getTwoFactorPolicy } from "@/lib/policy";
import { requireSuperadmin } from "@/lib/auth";
import { listAllInstances } from "@/lib/instances";
import { listUsers } from "@/lib/users";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users" };

export default async function UsersPage() {
  const me = await requireSuperadmin();
  return (
    <div>
      <PageHeader title="Users" description="Who can sign in to GlitchLens and which instances they can see." />
      <TwoFactorPolicyCard current={getTwoFactorPolicy()} />
      <UsersManager users={listUsers()} instances={listAllInstances()} currentUserId={me.id} />
    </div>
  );
}
