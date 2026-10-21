import { PageHeader } from "@/components/page-header";
import { InstancesManager } from "@/components/settings/instances-manager";
import { requireSuperadmin } from "@/lib/auth";
import { listAllInstances } from "@/lib/instances";

export const dynamic = "force-dynamic";
export const metadata = { title: "Instances" };

export default async function InstancesPage() {
  await requireSuperadmin();
  return (
    <div>
      <PageHeader
        title="GlitchTip instances"
        description="The GlitchTip servers GlitchLens connects to. Each one uses an API token you create in GlitchTip."
      />
      <InstancesManager instances={listAllInstances()} />
    </div>
  );
}
