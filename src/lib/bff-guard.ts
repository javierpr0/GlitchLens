import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import type { CurrentUser } from "@/lib/users";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Same-origin check for state-changing requests. SameSite=Lax on the session
 * cookie covers most CSRF, this closes the rest. Returns true when allowed.
 */
export function isSameOrigin(req: Request): boolean {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return true;
  const origin = req.headers.get("origin");
  if (!origin) {
    const site = req.headers.get("sec-fetch-site");
    return !site || site === "same-origin" || site === "none";
  }
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const hosts = [req.headers.get("host"), req.headers.get("x-forwarded-host")?.split(",")[0]?.trim()];
  return hosts.includes(originHost);
}

export const crossOriginResponse = () =>
  NextResponse.json({ error: "cross-origin request blocked" }, { status: 403 });

type Guarded = { user: CurrentUser; response?: undefined } | { response: NextResponse; user?: undefined };

/**
 * Authn + authz + anti-CSRF for BFF route handlers.
 * `write` rejects read-only (viewer) accounts; `superadmin` restricts to admins.
 */
export async function guardRequest(
  req: Request,
  opts: { write?: boolean; superadmin?: boolean; allowWithoutTwoFactor?: boolean } = {},
): Promise<Guarded> {
  if (!isSameOrigin(req)) return { response: crossOriginResponse() };
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  // The policy requires 2FA for this account: only the enrolment endpoints opt out of this check.
  if (user.needsTwoFactor && !opts.allowWithoutTwoFactor) {
    return {
      response: NextResponse.json(
        { error: "Two-factor authentication is required for your account. Set it up in Settings > Account.", reason: "two_factor_required" },
        { status: 403 },
      ),
    };
  }
  if (opts.superadmin && user.role !== "superadmin") {
    return { response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  if (opts.write && user.role === "viewer") {
    return { response: NextResponse.json({ error: "read-only account" }, { status: 403 }) };
  }
  return { user };
}
