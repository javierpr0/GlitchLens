import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { guardRequest } from "@/lib/bff-guard";
import { createInstance, probeInstance, probeUrl } from "@/lib/instances";
import { errorResponse, jsonError, readJson } from "@/lib/route-utils";

const InstanceBody = z.object({
  name: z.string().trim().min(1).max(80),
  baseUrl: z.string().trim().min(1).max(300),
  tokenMode: z.enum(["shared", "per_user"]).default("shared"),
  token: z.string().trim().min(1).max(500).optional(),
});

export async function POST(req: Request) {
  const guard = await guardRequest(req, { superadmin: true });
  if (guard.response) return guard.response;
  const parsed = await readJson(req, InstanceBody);
  if (parsed.response) return parsed.response;

  // Refuse to store a configuration that does not work: it would only surface later as a broken dashboard.
  if (parsed.data.tokenMode === "shared" && !parsed.data.token) return jsonError("A token is required for a shared-token instance.", 400);
  const probe = parsed.data.tokenMode === "shared"
    ? await probeInstance(parsed.data.baseUrl, parsed.data.token!)
    : await probeUrl(parsed.data.baseUrl);
  if (!probe.ok) return jsonError(probe.message, 400);

  try {
    const id = createInstance(parsed.data);
    recordAudit({
      actor: guard.user,
      action: "instance.create",
      target: `${parsed.data.name} (${parsed.data.baseUrl})`,
      detail: { tokenMode: parsed.data.tokenMode },
      headers: req.headers,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
