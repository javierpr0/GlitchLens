import { NextResponse } from "next/server";
import { z } from "zod";
import { guardRequest } from "@/lib/bff-guard";
import {
  deleteInstance,
  getInstance,
  getInstanceToken,
  normalizeBaseUrl,
  probeInstance,
  probeUrl,
  updateInstance,
} from "@/lib/instances";
import { errorResponse, jsonError, readJson } from "@/lib/route-utils";

const Body = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  baseUrl: z.string().trim().min(1).max(300).optional(),
  token: z.string().trim().min(1).max(500).optional(),
  tokenMode: z.enum(["shared", "per_user"]).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

async function parseId(ctx: Ctx): Promise<number | null> {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const guard = await guardRequest(req, { superadmin: true });
  if (guard.response) return guard.response;
  const id = await parseId(ctx);
  if (!id) return jsonError("Invalid id", 400);
  const parsed = await readJson(req, Body);
  if (parsed.response) return parsed.response;
  const patch = parsed.data;

  const current = getInstance(id);
  if (!current) return jsonError("Instance not found.", 404);

  try {
    const mode = patch.tokenMode ?? current.tokenMode;
    const urlChanged = !!patch.baseUrl && normalizeBaseUrl(patch.baseUrl) !== current.baseUrl;
    const url = patch.baseUrl ?? current.baseUrl;
    if (mode === "per_user") {
      if (urlChanged || current.tokenMode !== "per_user") {
        const probe = await probeUrl(url);
        if (!probe.ok) return jsonError(probe.message, 400);
      }
    } else if (urlChanged || patch.token || current.tokenMode !== "shared") {
      // A stored token is only ever sent to the URL it was saved with.
      if (urlChanged && !patch.token) return jsonError("Enter the token again when you change the URL.", 400);
      const token = patch.token ?? (current.tokenMode === "shared" ? getInstanceToken(id) : null);
      if (!token) return jsonError("Enter the shared token for this instance.", 400);
      // Same rule as creation: only store connections that work.
      const probe = await probeInstance(url, token);
      if (!probe.ok) return jsonError(probe.message, 400);
    }
    updateInstance(id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const guard = await guardRequest(req, { superadmin: true });
  if (guard.response) return guard.response;
  const id = await parseId(ctx);
  if (!id) return jsonError("Invalid id", 400);
  try {
    deleteInstance(id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
