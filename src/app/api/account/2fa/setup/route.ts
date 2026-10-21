import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { guardRequest } from "@/lib/bff-guard";
import { jsonError } from "@/lib/route-utils";
import { beginSetup } from "@/lib/twofactor";

export async function POST(req: Request) {
  const guard = await guardRequest(req);
  if (guard.response) return guard.response;
  const setup = beginSetup(guard.user.id, guard.user.email);
  if (!setup) return jsonError("Two-factor authentication is already enabled.", 409);
  recordAudit({ actor: guard.user, action: "2fa.setup_started", headers: req.headers });
  return NextResponse.json(setup);
}
