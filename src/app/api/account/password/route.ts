import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionHash } from "@/lib/auth";
import { guardRequest } from "@/lib/bff-guard";
import { errorResponse, readJson } from "@/lib/route-utils";
import { PASSWORD_MAX, PASSWORD_MIN, changeOwnPassword } from "@/lib/users";

const Body = z.object({
  current: z.string().min(1).max(1024),
  next: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
});

export async function POST(req: Request) {
  const guard = await guardRequest(req);
  if (guard.response) return guard.response;
  const parsed = await readJson(req, Body);
  if (parsed.response) return parsed.response;
  try {
    await changeOwnPassword(guard.user.id, parsed.data.current, parsed.data.next, (await getSessionHash()) ?? "");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
