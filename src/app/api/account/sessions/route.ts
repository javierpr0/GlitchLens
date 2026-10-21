import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { getSessionHash, listSessions, revokeOtherSessions, revokeSession } from "@/lib/auth";
import { guardRequest } from "@/lib/bff-guard";
import { jsonError, readJson } from "@/lib/route-utils";

const Body = z.union([z.object({ id: z.string().min(1).max(32) }), z.object({ others: z.literal(true) })]);

export async function GET(req: Request) {
  const guard = await guardRequest(req);
  if (guard.response) return guard.response;
  return NextResponse.json({ sessions: listSessions(guard.user.id, await getSessionHash()) });
}

export async function DELETE(req: Request) {
  const guard = await guardRequest(req);
  if (guard.response) return guard.response;
  const parsed = await readJson(req, Body);
  if (parsed.response) return parsed.response;

  const current = await getSessionHash();
  if ("others" in parsed.data) {
    const count = revokeOtherSessions(guard.user.id, current);
    recordAudit({ actor: guard.user, action: "session.revoke_others", detail: { count }, headers: req.headers });
    return NextResponse.json({ revoked: count });
  }
  if (!revokeSession(guard.user.id, parsed.data.id, current)) return jsonError("Session not found.", 404);
  recordAudit({ actor: guard.user, action: "session.revoke", headers: req.headers });
  return new NextResponse(null, { status: 204 });
}
