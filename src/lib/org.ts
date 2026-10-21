import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { api } from "@/lib/glitchtip/api";
import { GlitchTipError, InstanceAuthError } from "@/lib/glitchtip/client";
import { requireActiveInstance } from "@/lib/instances";
import type { Organization } from "@/lib/glitchtip/types";

/** Org preference is per instance: slugs from one GlitchTip mean nothing in another. */
export const orgCookieName = (instanceId: number) => `gl_org_${instanceId}`;

/** Cached per request: the layout and the page both need the list. */
export const listOrganizations = cache(async (): Promise<Organization[]> => {
  try {
    return await api.organizations();
  } catch (e) {
    // A 403 here means the token cannot even list organizations: same problem as a bad token.
    if (e instanceof GlitchTipError && e.status === 403) throw new InstanceAuthError(e.detail);
    throw e;
  }
});

export const getActiveOrg = cache(async (): Promise<Organization | null> => {
  const orgs = await listOrganizations();
  if (!orgs.length) return null;
  const { instance } = await requireActiveInstance();
  const slug = (await cookies()).get(orgCookieName(instance.id))?.value;
  return orgs.find((o) => o.slug === slug) ?? orgs[0];
});

export async function getActiveOrgSlug(): Promise<string | null> {
  return (await getActiveOrg())?.slug ?? null;
}
