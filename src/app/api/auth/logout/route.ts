import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { recordAudit } from "@/lib/audit";
import { SESSION_COOKIE, clearSessionCookie, destroySession, getCurrentUser } from "@/lib/auth";
import { crossOriginResponse, isSameOrigin } from "@/lib/bff-guard";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return crossOriginResponse();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = token ? await getCurrentUser() : null;
  if (token) destroySession(token);
  if (user) recordAudit({ actor: user, action: "logout", headers: req.headers });
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res, req);
  return res;
}
