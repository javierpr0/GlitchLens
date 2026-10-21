import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { createSession, setSessionCookie } from "@/lib/auth";
import { clearSetupCode, setupPending, verifySetupCode } from "@/lib/bootstrap";
import { crossOriginResponse, isSameOrigin } from "@/lib/bff-guard";
import { hashPassword } from "@/lib/crypto";
import { clientIp } from "@/lib/login-throttle";
import { PASSWORD_MAX, PASSWORD_MIN, createFirstSuperadmin } from "@/lib/users";
import { errorResponse, jsonError, readJson } from "@/lib/route-utils";

const Body = z.object({
  code: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(100),
  email: z.email().max(254),
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
});

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return crossOriginResponse();
  if (!setupPending()) return jsonError("Not found", 404);

  const parsed = await readJson(req, Body);
  if (parsed.response) return parsed.response;
  const { code, name, email, password } = parsed.data;

  if (!verifySetupCode(code)) return jsonError("Invalid setup code.", 403);

  try {
    const id = createFirstSuperadmin({ email, name, passwordHash: await hashPassword(password) });
    clearSetupCode();
    const res = NextResponse.json({ ok: true });
    setSessionCookie(res, req, createSession(id, { userAgent: req.headers.get("user-agent"), ip: clientIp(req.headers) }));
    recordAudit({ actor: { id, email }, action: "setup.complete", target: email, headers: req.headers });
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
