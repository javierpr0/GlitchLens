import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, clearSessionCookie, destroySession } from "@/lib/auth";
import { crossOriginResponse, isSameOrigin } from "@/lib/bff-guard";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return crossOriginResponse();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) destroySession(token);
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res, req);
  return res;
}
