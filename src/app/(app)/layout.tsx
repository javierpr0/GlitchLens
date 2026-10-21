import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { requireUser } from "@/lib/auth";
import { getInstanceContext } from "@/lib/instances";
import { getActiveOrg, listOrganizations } from "@/lib/org";
import type { Organization } from "@/lib/glitchtip/types";
import type { ReactNode } from "react";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const ctx = await getInstanceContext();

  // The shell must render even when the instance is down, otherwise nobody can reach the settings to fix it.
  // WorkspaceGuard reports the actual problem for the data pages.
  let orgs: Organization[] = [];
  let active: Organization | null = null;
  if (ctx.kind === "ok") {
    try {
      [orgs, active] = await Promise.all([listOrganizations(), getActiveOrg()]);
    } catch {
      orgs = [];
    }
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
          orgs={orgs}
          active={active}
          instances={ctx.instances}
          activeInstanceId={ctx.kind === "none" ? null : ctx.instance.id}
        />
        <main className="flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:px-8 [padding-left:max(0.75rem,env(safe-area-inset-left))] [padding-right:max(0.75rem,env(safe-area-inset-right))] [padding-bottom:max(1rem,env(safe-area-inset-bottom))] sm:[padding-left:max(1.5rem,env(safe-area-inset-left))] sm:[padding-right:max(1.5rem,env(safe-area-inset-right))]">
          {children}
        </main>
      </div>
    </div>
  );
}
