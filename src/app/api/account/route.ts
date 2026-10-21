import { NextResponse } from "next/server";
import { z } from "zod";
import { guardRequest } from "@/lib/bff-guard";
import { readJson } from "@/lib/route-utils";
import { updateOwnName } from "@/lib/users";

const Body = z.object({ name: z.string().trim().min(1).max(100) });

export async function PATCH(req: Request) {
  const guard = await guardRequest(req);
  if (guard.response) return guard.response;
  const parsed = await readJson(req, Body);
  if (parsed.response) return parsed.response;
  updateOwnName(guard.user.id, parsed.data.name);
  return NextResponse.json({ ok: true });
}
