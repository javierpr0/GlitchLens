import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { createSession, setSessionCookie } from "@/lib/auth";
import { crossOriginResponse, isSameOrigin } from "@/lib/bff-guard";
import { clientIp, lockedFor, recordFailure } from "@/lib/login-throttle";
import { errorResponse, jsonError, readJson } from "@/lib/route-utils";
import {
  consumeChallenge,
  isRecoveryCodeInput,
  takeChallengeAttempt,
  verifySecondFactor,
} from "@/lib/twofactor";
import { completeLogin, getUserForSecondFactor } from "@/lib/users";

const Body = z.object({
  challenge: z.string().min(1).max(200),
  code: z.string().trim().min(1).max(64),
});

const INVALID = "Invalid or expired code. Sign in again if this keeps happening.";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return crossOriginResponse();
  const parsed = await readJson(req, Body);
  if (parsed.response) return parsed.response;
  const ip = clientIp(req.headers);

  try {
    const userId = takeChallengeAttempt(parsed.data.challenge);
    if (userId === null) return jsonError(INVALID, 401);

    // Everything is checked again here: the account may have changed since the password step.
    const user = getUserForSecondFactor(userId);
    if (!user) {
      consumeChallenge(parsed.data.challenge);
      return jsonError(INVALID, 401);
    }
    const retryAfter = lockedFor(user.email, ip);
    if (retryAfter > 0) {
      const res = jsonError("Too many failed attempts. Try again later.", 429);
      res.headers.set("Retry-After", String(retryAfter));
      return res;
    }

    const result = verifySecondFactor(user.id, parsed.data.code);
    if (result !== "ok") {
      // Same counter as the password: code guessing locks the account like password guessing does.
      recordFailure(user.email, ip, true);
      recordAudit({
        actor: null,
        actorEmail: user.email,
        action: result === "unreadable" ? "login.2fa_unreadable" : "login.2fa_failed",
        target: user.email,
        headers: req.headers,
      });
      return jsonError(
        result === "unreadable"
          ? "Two-factor verification is unavailable for this account. Ask a superadmin to reset it."
          : INVALID,
        401,
      );
    }

    consumeChallenge(parsed.data.challenge);
    completeLogin(user.id, user.email);
    const res = NextResponse.json({ ok: true });
    setSessionCookie(res, req, createSession(user.id, { userAgent: req.headers.get("user-agent"), ip }));
    recordAudit({
      actor: user,
      action: "login",
      detail: { method: isRecoveryCodeInput(parsed.data.code) ? "recovery_code" : "totp" },
      headers: req.headers,
    });
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
