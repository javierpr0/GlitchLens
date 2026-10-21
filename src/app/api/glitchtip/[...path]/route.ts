import { NextResponse } from "next/server";
import { guardRequest } from "@/lib/bff-guard";
import { glitchtipFetch } from "@/lib/glitchtip/client";
import { canAccess } from "@/lib/permissions";
import { NoInstanceError, getInstanceContext } from "@/lib/instances";
import { errorResponse, jsonError } from "@/lib/route-utils";

type Params = { params: Promise<{ path: string[] }> };

async function proxy(req: Request, params: Params, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE") {
  const guard = await guardRequest(req);
  if (guard.response) return guard.response;

  const { path: segments } = await params.params;
  // Only plain path segments: this endpoint carries the instance token, so it must not be steerable.
  if (segments.some((s) => !s || s === "." || s === ".." || /[\\/\0]/.test(s))) {
    return jsonError("Invalid path", 400);
  }
  const subpath = segments.join("/");
  const ctx = await getInstanceContext();
  if (ctx.kind !== "ok") return errorResponse(new NoInstanceError(ctx.kind));
  if (!canAccess(guard.user.role, method, subpath, ctx.instance.tokenMode)) {
    return jsonError("Your role does not allow this request.", 403);
  }

  let body: unknown = undefined;
  if (method !== "GET" && method !== "DELETE") {
    try {
      const ct = req.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) body = await req.json();
      else body = await req.text();
    } catch {
      body = undefined;
    }
  }

  try {
    const target = `/api/0/${segments.map(encodeURIComponent).join("/")}/${new URL(req.url).search}`;
    const data = await glitchtipFetch<unknown>(target, { method, body });
    if (data === undefined) return new NextResponse(null, { status: 204 });
    return NextResponse.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}

export const GET = (req: Request, params: Params) => proxy(req, params, "GET");
export const POST = (req: Request, params: Params) => proxy(req, params, "POST");
export const PUT = (req: Request, params: Params) => proxy(req, params, "PUT");
export const PATCH = (req: Request, params: Params) => proxy(req, params, "PATCH");
export const DELETE = (req: Request, params: Params) => proxy(req, params, "DELETE");
