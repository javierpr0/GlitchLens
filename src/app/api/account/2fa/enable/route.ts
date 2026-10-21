import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { getSessionHash } from "@/lib/auth";
import { guardRequest } from "@/lib/bff-guard";
import { clientIp, lockedFor, recordFailure } from "@/lib/login-throttle";
import { errorResponse, jsonError, readJson } from "@/lib/route-utils";
import { confirmSetup } from "@/lib/twofactor";
import { verifyCurrentPassword } from "@/lib/users";

const Body = z.object({
  password: z.string().min(1).max(1024),
  code: z.string().trim().min(1).max(32),
});

export async function POST(req: Request) {
  const guard = await guardRequest(req);
  if (guard.response) return guard.response;
  const parsed = await readJson(req, Body);
  if (parsed.response) return parsed.response;
  const ip = clientIp(req.headers);

  // Turning 2FA on also ends the user's other sessions, so a stolen session must not be able to do it: ask for the password.
  try {
    await verifyCurrentPassword(guard.user, parsed.data.password, ip);
  } catch (e) {
    return errorResponse(e);
  }
  if (lockedFor(guard.user.email, ip) > 0) return jsonError("Too many failed attempts. Try again later.", 429);
  const codes = confirmSetup(guard.user.id, parsed.data.code, await getSessionHash());
  if (!codes) {
    recordFailure(guard.user.email, ip, true);
    return jsonError("That code is not valid. Check the clock on your phone and try the next code.", 400);
  }
  recordAudit({ actor: guard.user, action: "2fa.enable", headers: req.headers });
  return NextResponse.json({ recoveryCodes: codes });
}
