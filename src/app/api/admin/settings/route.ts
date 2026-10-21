import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { guardRequest } from "@/lib/bff-guard";
import { TWO_FACTOR_POLICIES, getTwoFactorPolicy, setTwoFactorPolicy, type TwoFactorPolicy } from "@/lib/policy";
import { jsonError, readJson } from "@/lib/route-utils";
import { isTwoFactorEnabled } from "@/lib/twofactor";

const Body = z.object({ requireTwoFactor: z.enum(TWO_FACTOR_POLICIES as [TwoFactorPolicy, ...TwoFactorPolicy[]]) });

export async function PUT(req: Request) {
  const guard = await guardRequest(req, { superadmin: true });
  if (guard.response) return guard.response;
  const parsed = await readJson(req, Body);
  if (parsed.response) return parsed.response;
  const next = parsed.data.requireTwoFactor;

  // Whoever turns the policy on must already comply, so it can never be set by an account the policy would lock out.
  if (next !== "off" && !isTwoFactorEnabled(guard.user.id)) {
    return jsonError("Turn on your own two-factor authentication first (Settings > Account).", 400);
  }
  const previous = getTwoFactorPolicy();
  setTwoFactorPolicy(next);
  recordAudit({ actor: guard.user, action: "policy.update", target: "require_2fa", detail: { from: previous, to: next }, headers: req.headers });
  return NextResponse.json({ requireTwoFactor: next });
}
