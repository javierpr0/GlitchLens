import "server-only";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { GlitchTipError, InstanceAuthError } from "@/lib/glitchtip/client";
import { InstanceError, NoInstanceError } from "@/lib/instances";
import { UserError } from "@/lib/users";

export const jsonError = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Parses and validates a JSON body. Returns the data or a ready 400 response. */
export async function readJson<T>(
  req: Request,
  schema: ZodType<T>,
): Promise<{ data: T; response?: undefined } | { response: NextResponse; data?: undefined }> {
  const raw = await req.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join(".");
    return { response: jsonError(field ? `Invalid ${field}: ${issue.message}` : "Invalid request body", 400) };
  }
  return { data: parsed.data };
}

const USER_STATUS: Record<UserError["code"], number> = {
  email_taken: 409,
  not_found: 404,
  last_superadmin: 409,
  self: 400,
  setup_done: 409,
  bad_instances: 400,
  bad_password: 400,
  locked: 429,
};

const INSTANCE_STATUS: Record<InstanceError["code"], number> = {
  invalid_url: 400,
  url_taken: 409,
  not_found: 404,
};

/** Maps domain errors to responses. Anything unknown is logged without details and returned as 500. */
export function errorResponse(e: unknown): NextResponse {
  if (e instanceof UserError) return jsonError(e.message, USER_STATUS[e.code]);
  if (e instanceof InstanceError) return jsonError(e.message, INSTANCE_STATUS[e.code]);
  if (e instanceof NoInstanceError) {
    return NextResponse.json({ error: "No usable GlitchTip instance", reason: e.reason }, { status: 409 });
  }
  if (e instanceof InstanceAuthError) {
    return jsonError("GlitchTip rejected this instance's token. Ask a superadmin to update it.", 502);
  }
  if (e instanceof GlitchTipError) {
    return NextResponse.json({ error: e.detail ?? e.message }, { status: e.status });
  }
  console.error("[glitchlens] unhandled error:", e instanceof Error ? e.message : "unknown");
  return jsonError("Internal error", 500);
}
