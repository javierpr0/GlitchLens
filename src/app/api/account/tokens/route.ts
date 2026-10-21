import { NextResponse } from "next/server";
import { z } from "zod";
import { guardRequest } from "@/lib/bff-guard";
import {
  deleteUserToken,
  listInstancesForUser,
  probeInstance,
  setUserToken,
  type Instance,
} from "@/lib/instances";
import { jsonError, readJson } from "@/lib/route-utils";
import type { CurrentUser } from "@/lib/users";

const SetBody = z.object({
  instanceId: z.number().int().positive(),
  token: z.string().trim().min(1).max(500),
});
const DeleteBody = z.object({ instanceId: z.number().int().positive() });

function ownInstance(user: CurrentUser, id: number): Instance | undefined {
  return listInstancesForUser(user).find((i) => i.id === id && i.tokenMode === "per_user");
}

export async function POST(req: Request) {
  const guard = await guardRequest(req);
  if (guard.response) return guard.response;
  const parsed = await readJson(req, SetBody);
  if (parsed.response) return parsed.response;

  const instance = ownInstance(guard.user, parsed.data.instanceId);
  if (!instance) return jsonError("That instance does not use personal tokens or you cannot access it.", 404);

  const probe = await probeInstance(instance.baseUrl, parsed.data.token);
  if (!probe.ok) return jsonError(probe.message, 400);
  setUserToken(guard.user.id, instance.id, parsed.data.token);
  return NextResponse.json({ ok: true, account: probe.account });
}

export async function DELETE(req: Request) {
  const guard = await guardRequest(req);
  if (guard.response) return guard.response;
  const parsed = await readJson(req, DeleteBody);
  if (parsed.response) return parsed.response;
  if (!ownInstance(guard.user, parsed.data.instanceId)) return jsonError("Instance not found.", 404);
  deleteUserToken(guard.user.id, parsed.data.instanceId);
  return new NextResponse(null, { status: 204 });
}
