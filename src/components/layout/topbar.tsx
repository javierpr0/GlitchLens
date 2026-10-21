import { OrgSwitcher } from "./org-switcher";
import { InstanceSwitcher } from "./instance-switcher";
import { UserMenu } from "./user-menu";
import { MobileNavTrigger } from "./sidebar";
import { NotificationBell } from "@/components/notifications/notification-bell";
import type { Organization } from "@/lib/glitchtip/types";
import type { Instance } from "@/lib/instances";
import type { CurrentUser } from "@/lib/users";

export function Topbar({
  user,
  orgs,
  active,
  instances,
  activeInstanceId,
}: {
  user: CurrentUser;
  orgs: Organization[];
  active: Organization | null;
  instances: Instance[];
  activeInstanceId: number | null;
}) {
  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-background/80 backdrop-blur [padding-top:env(safe-area-inset-top)]">
      <div className="flex h-14 items-center gap-1 px-3 sm:gap-2 sm:px-6 lg:px-8">
        <MobileNavTrigger />
        <InstanceSwitcher instances={instances} activeId={activeInstanceId} />
        {activeInstanceId !== null && <OrgSwitcher orgs={orgs} active={active} />}
        <div className="flex-1" />
        {activeInstanceId !== null && (
          <NotificationBell userId={String(user.id)} instanceId={activeInstanceId} />
        )}
        <UserMenu name={user.name} email={user.email} role={user.role} />
      </div>
    </header>
  );
}
