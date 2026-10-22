import "server-only";
import type { ZodType } from "zod";
import { requireActiveInstance } from "@/lib/instances";
import type { Paginated } from "./types";

const REQUEST_TIMEOUT_MS = 20_000;

export class GlitchTipError extends Error {
  constructor(public status: number, public detail: unknown, message?: string) {
    super(message ?? `GlitchTip API error ${status}`);
    this.name = "GlitchTipError";
  }
}

/** GlitchTip answered 401: the active instance's token is invalid or revoked.
 *  It says nothing about the GlitchLens user's session, so never log the user out for it. */
export class InstanceAuthError extends GlitchTipError {
  constructor(detail: unknown = null) {
    super(401, detail, "GlitchTip rejected the instance token");
    this.name = "InstanceAuthError";
  }
}

/** Network failure, timeout or an unexpected redirect talking to the instance. */
export class InstanceUnreachableError extends GlitchTipError {
  constructor(message: string) {
    super(502, null, message);
    this.name = "InstanceUnreachableError";
  }
}

type SearchValue = string | number | string[] | undefined | null;

interface FetchOpts extends Omit<RequestInit, "body"> {
  body?: unknown;
  searchParams?: Record<string, SearchValue>;
  /** Optional runtime guard for the response shape (non-fatal: logs on mismatch). */
  schema?: ZodType;
}

/** Validate without throwing: surfaces API drift without crashing a live page. */
function validate(schema: ZodType | undefined, data: unknown, label: string) {
  if (!schema) return;
  const r = schema.safeParse(data);
  if (!r.success) {
    console.warn(`[glitchtip] response shape mismatch for ${label}:`, r.error.issues.slice(0, 3));
  }
}

function applySearchParams(url: URL, params: Record<string, SearchValue>) {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item === undefined || item === null || item === "") continue;
        url.searchParams.append(k, String(item));
      }
    } else {
      url.searchParams.set(k, String(v));
    }
  }
}

async function request(path: string, opts: FetchOpts & { method: string }): Promise<Response> {
  const { body, searchParams, headers: extraHeaders, method, schema: _schema, ...rest } = opts;
  void _schema;
  const { instance } = await requireActiveInstance();

  const url = new URL(`${instance.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
  if (searchParams) applySearchParams(url, searchParams);
  // The path comes from our own code or the sanitized proxy, but never let it leave the API.
  if (url.origin !== new URL(instance.baseUrl).origin) {
    throw new InstanceUnreachableError("Refusing to call a different origin than the instance");
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${instance.token}`,
    ...(extraHeaders as Record<string, string> | undefined),
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new InstanceUnreachableError(timeout ? "GlitchTip did not respond in time" : "Could not reach GlitchTip");
  }

  if (res.status >= 300 && res.status < 400) {
    throw new InstanceUnreachableError("GlitchTip redirected the request: update the instance URL");
  }
  if (!res.ok) {
    // Read the body once: a failed res.json() would have already consumed it.
    const text = await res.text().catch(() => "");
    let detail: unknown = text || null;
    try {
      detail = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON (for example an HTML error page): keep the text */
    }
    if (res.status === 401) throw new InstanceAuthError(detail);
    throw new GlitchTipError(res.status, detail);
  }
  return res;
}

export async function glitchtipFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const method = opts.method ?? "GET";
  const res = await request(path, { ...opts, method });

  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return undefined as T;
  const json = await res.json();
  validate(opts.schema, json, `${method} ${path}`);
  return json as T;
}

export interface FetchPaginatedOpts extends FetchOpts {
  cursor?: string | null;
  limit?: number;
}

export async function glitchtipFetchPaginated<T>(
  path: string,
  opts: FetchPaginatedOpts = {},
): Promise<Paginated<T>> {
  const { cursor, limit = 25, searchParams = {}, body: _body, schema, method = "GET", ...rest } = opts;
  void _body;
  const params: Record<string, SearchValue> = { ...searchParams, limit: String(limit) };
  if (cursor) params.cursor = cursor;

  const res = await request(path, { ...rest, method, searchParams: params });

  const data = (await res.json()) as T[];
  if (schema) data.forEach((item) => validate(schema, item, `${method} ${path}[]`));
  const link = res.headers.get("link") ?? "";
  const total = Number(res.headers.get("x-hits") ?? "0") || data.length;
  const maxHits = Number(res.headers.get("x-max-hits") ?? "0") || total;

  return { data, nextCursor: parseLinkCursor(link, "next"), prevCursor: parseLinkCursor(link, "previous"), total, maxHits };
}

export function parseLinkCursor(link: string, rel: "next" | "previous"): string | null {
  if (!link) return null;
  const segments = link.split(",").map((s) => s.trim());
  for (const seg of segments) {
    const m = seg.match(/<([^>]+)>/);
    const relMatch = seg.match(/rel="([^"]+)"/);
    const resultsMatch = seg.match(/results="([^"]+)"/);
    const cursorMatch = seg.match(/cursor="([^"]+)"/);
    if (!m || !relMatch) continue;
    if (relMatch[1] !== rel) continue;
    if (resultsMatch && resultsMatch[1] === "false") return null;
    if (cursorMatch) return cursorMatch[1];
    try {
      const u = new URL(m[1]);
      const c = u.searchParams.get("cursor");
      if (c) return c;
    } catch { /* ignore */ }
  }
  return null;
}
