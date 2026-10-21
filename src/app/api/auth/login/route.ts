import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { createSession, setSessionCookie } from "@/lib/auth";
import { crossOriginResponse, isSameOrigin } from "@/lib/bff-guard";
import { clientIp } from "@/lib/login-throttle";
import { errorResponse, jsonError, readJson } from "@/lib/route-utils";
import { verifyLogin } from "@/lib/users";

const Body = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(1024),
});

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return crossOriginResponse();
  const parsed = await readJson(req, Body);
  if (parsed.response) return parsed.response;

  try {
    const result = await verifyLogin(parsed.data.email, parsed.data.password, clientIp(req.headers));
    if (!result.ok) {
      if (result.reason === "locked") {
        const res = jsonError("Too many failed attempts. Try again later.", 429);
        res.headers.set("Retry-After", String(result.retryAfter));
        return res;
      }
      if (result.reason === "busy") {
        const res = jsonError("The server is busy. Try again in a moment.", 503);
        res.headers.set("Retry-After", "2");
        return res;
      }
      return jsonError("Invalid email or password.", 401);
    }
    const res = NextResponse.json({ ok: true });
    setSessionCookie(
      res,
      req,
      createSession(result.user.id, { userAgent: req.headers.get("user-agent"), ip: clientIp(req.headers) }),
    );
    recordAudit({ actor: result.user, action: "login", headers: req.headers });
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
