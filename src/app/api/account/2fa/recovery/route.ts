import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { guardRequest } from "@/lib/bff-guard";
import { clientIp, lockedFor, recordFailure } from "@/lib/login-throttle";
import { errorResponse, jsonError, readJson } from "@/lib/route-utils";
import { regenerateRecoveryCodes, isTwoFactorEnabled, verifySecondFactor } from "@/lib/twofactor";
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
    // Sensitive action: current password and a valid second factor, both counted against the account lock.
    await verifyCurrentPassword(guard.user, parsed.data.password, ip);
    if (lockedFor(guard.user.email, ip) > 0) return jsonError("Too many failed attempts. Try again later.", 429);
    if (verifySecondFactor(guard.user.id, parsed.data.code) !== "ok") {
      recordFailure(guard.user.email, ip, true);
      return jsonError("That code is not valid.", 400);
    }
    const codes = regenerateRecoveryCodes(guard.user.id);
    recordAudit({ actor: guard.user, action: "2fa.recovery_regenerate", headers: req.headers });
    return NextResponse.json({ recoveryCodes: codes });
  } catch (e) {
    return errorResponse(e);
  }
}
