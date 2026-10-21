import { PageHeader } from "@/components/page-header";
import { UsersManager } from "@/components/settings/users-manager";
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
      <UsersManager users={listUsers()} instances={listAllInstances()} currentUserId={me.id} />
    </div>
  );
}
