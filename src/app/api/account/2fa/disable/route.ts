import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { guardRequest } from "@/lib/bff-guard";
import { clientIp, lockedFor, recordFailure } from "@/lib/login-throttle";
import { errorResponse, jsonError, readJson } from "@/lib/route-utils";
import { getTwoFactorPolicy, mustEnrollTwoFactor } from "@/lib/policy";
import { disableTwoFactor, isTwoFactorEnabled, verifySecondFactor } from "@/lib/twofactor";
import { verifyCurrentPassword } from "@/lib/users";

const Body = z.object({
  password: z.string().min(1).max(1024),
  code: z.string().trim().min(1).max(64),
});

export async function POST(req: Request) {
  const guard = await guardRequest(req);
  if (guard.response) return guard.response;
  const parsed = await readJson(req, Body);
  if (parsed.response) return parsed.response;
  const ip = clientIp(req.headers);

  try {
    if (!isTwoFactorEnabled(guard.user.id)) return jsonError("Two-factor authentication is not enabled.", 409);
    // Turning it off would put the account straight back into "must enrol": refuse instead of creating that state.
    if (mustEnrollTwoFactor(guard.user.role, false, getTwoFactorPolicy())) {
      return jsonError("Your administrator requires two-factor authentication, so it cannot be turned off.", 400);
    }
    // Sensitive action: current password and a valid second factor, both counted against the account lock.
    await verifyCurrentPassword(guard.user, parsed.data.password, ip);
    if (lockedFor(guard.user.email, ip) > 0) return jsonError("Too many failed attempts. Try again later.", 429);
    if (verifySecondFactor(guard.user.id, parsed.data.code) !== "ok") {
      recordFailure(guard.user.email, ip, true);
      return jsonError("That code is not valid.", 400);
    }
    disableTwoFactor(guard.user.id);
    recordAudit({ actor: guard.user, action: "2fa.disable", headers: req.headers });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
