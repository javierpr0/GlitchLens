import { NextResponse } from "next/server";
import { z } from "zod";
import { guardRequest } from "@/lib/bff-guard";
import { isSecureRequest } from "@/lib/auth";
import { requireActiveInstance } from "@/lib/instances";
import { orgCookieName } from "@/lib/org";
import { errorResponse, readJson } from "@/lib/route-utils";

const Body = z.object({ slug: z.string().regex(/^[\w-]{1,100}$/) });

export async function POST(req: Request) {
  const guard = await guardRequest(req);
  if (guard.response) return guard.response;
  const parsed = await readJson(req, Body);
  if (parsed.response) return parsed.response;
  try {
    const { instance } = await requireActiveInstance();
    // Not trusted at read time either: getActiveOrg only honours slugs GlitchTip lists for this token.
    const res = NextResponse.json({ ok: true });
    res.cookies.set(orgCookieName(instance.id), parsed.data.slug, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureRequest(req),
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
