import { NextResponse } from "next/server";
import { z } from "zod";
import { guardRequest } from "@/lib/bff-guard";
import { isSecureRequest } from "@/lib/auth";
import { INSTANCE_COOKIE, listInstancesForUser } from "@/lib/instances";
import { jsonError, readJson } from "@/lib/route-utils";

const Body = z.object({ id: z.number().int().positive() });

export async function POST(req: Request) {
  const guard = await guardRequest(req);
  if (guard.response) return guard.response;
  const parsed = await readJson(req, Body);
  if (parsed.response) return parsed.response;

  if (!listInstancesForUser(guard.user).some((i) => i.id === parsed.data.id)) {
    return jsonError("You do not have access to that instance.", 403);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(INSTANCE_COOKIE, String(parsed.data.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
