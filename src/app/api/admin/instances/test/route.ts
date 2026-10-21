import { NextResponse } from "next/server";
import { z } from "zod";
import { guardRequest } from "@/lib/bff-guard";
import { getInstance, getInstanceToken, normalizeBaseUrl, probeInstance, probeUrl } from "@/lib/instances";
import { jsonError, readJson } from "@/lib/route-utils";

const Body = z.object({
  baseUrl: z.string().trim().min(1).max(300).optional(),
  token: z.string().trim().min(1).max(500).optional(),
  instanceId: z.number().int().positive().optional(),
  tokenMode: z.enum(["shared", "per_user"]).default("shared"),
});

export async function POST(req: Request) {
  const guard = await guardRequest(req, { superadmin: true });
  if (guard.response) return guard.response;
  const parsed = await readJson(req, Body);
  if (parsed.response) return parsed.response;
  const { instanceId } = parsed.data;

  // When editing, a blank token or URL means "keep the stored one".
  const stored = instanceId ? getInstance(instanceId) : null;
  const baseUrl = parsed.data.baseUrl ?? stored?.baseUrl;
  if (!baseUrl) return jsonError("A URL is required.", 400);
  // The stored token may only be tried against the URL it belongs to, otherwise this endpoint could send it anywhere.
  let urlChanged = false;
  try {
    urlChanged = !!stored && normalizeBaseUrl(baseUrl) !== stored.baseUrl;
  } catch {
    return jsonError("That is not a valid URL.", 400);
  }
  if (urlChanged && !parsed.data.token) return jsonError("Enter the token again when you change the URL.", 400);
  if (parsed.data.tokenMode === "per_user") return NextResponse.json(await probeUrl(baseUrl));
  const token = parsed.data.token ?? (instanceId && !urlChanged ? getInstanceToken(instanceId) : null);
  if (!token) return jsonError("A token is required.", 400);

  return NextResponse.json(await probeInstance(baseUrl, token));
}
