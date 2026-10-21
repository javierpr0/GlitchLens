import type { ReactNode } from "react";
import { InstanceProblem, type ProblemKind } from "@/components/instance-problem";
import { GlitchTipError } from "@/lib/glitchtip/client";
import { getInstanceContext } from "@/lib/instances";
import { listOrganizations } from "@/lib/org";

/**
 * Wraps pages that need live GlitchTip data. When the active instance is
 * missing or broken it shows what to do instead of a crash, and leaves the
 * settings pages (outside this guard) reachable so the problem can be fixed.
 */
export async function WorkspaceGuard({ children }: { children: ReactNode }) {
  const ctx = await getInstanceContext();
  const isSuperadmin = ctx.user.role === "superadmin";
  if (ctx.kind !== "ok") {
    return (
      <InstanceProblem
        kind={ctx.kind}
        isSuperadmin={isSuperadmin}
        instanceName={ctx.kind === "none" ? undefined : ctx.instance.name}
        tokenMode={ctx.kind === "none" ? undefined : ctx.instance.tokenMode}
      />
    );
  }
  try {
    await listOrganizations();
  } catch (e) {
    if (e instanceof GlitchTipError && (e.status === 401 || e.status === 502)) {
      const kind: ProblemKind = e.status === 401 ? "auth" : "unreachable";
      return <InstanceProblem kind={kind} isSuperadmin={isSuperadmin} instanceName={ctx.instance.name} tokenMode={ctx.instance.tokenMode} />;
    }
    throw e;
  }
  return children;
}
