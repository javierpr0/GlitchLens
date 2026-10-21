import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getCurrentUser } from "@/lib/auth";
import type { CurrentUser } from "@/lib/users";

export const INSTANCE_COOKIE = "gl_instance";

export type TokenMode = "shared" | "per_user";

export interface Instance {
  id: number;
  name: string;
  baseUrl: string;
  tokenMode: TokenMode;
  createdAt: number;
}

export interface ActiveInstance extends Instance {
  token: string;
}

export class InstanceError extends Error {
  constructor(public code: "invalid_url" | "url_taken" | "not_found", message: string) {
    super(message);
    this.name = "InstanceError";
  }
}

/** The request cannot reach GlitchTip: no session, no instance, or a stored token we cannot decrypt. */
export class NoInstanceError extends Error {
  constructor(public reason: "unauthenticated" | "none" | "token_unreadable" | "needs_token") {
    super(`No usable GlitchTip instance (${reason})`);
    this.name = "NoInstanceError";
  }
}

interface InstanceRow {
  id: number;
  name: string;
  base_url: string;
  token_enc: string;
  token_mode: TokenMode;
  created_at: number;
}

const toInstance = (r: InstanceRow): Instance => ({
  id: r.id,
  name: r.name,
  baseUrl: r.base_url,
  tokenMode: r.token_mode,
  createdAt: r.created_at,
});

/**
 * Only http(s), no embedded credentials, no query or hash. Private hosts and
 * localhost are allowed on purpose: self-hosted GlitchTip commonly lives there,
 * and only the superadmin can set this URL.
 */
export function normalizeBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new InstanceError("invalid_url", "That is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new InstanceError("invalid_url", "The URL must start with http:// or https://");
  }
  if (url.username || url.password) {
    throw new InstanceError("invalid_url", "Do not put credentials in the URL.");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

function isUnique(e: unknown): boolean {
  return e instanceof Error && /UNIQUE constraint failed/i.test(e.message);
}

export function listAllInstances(): Instance[] {
  const rows = getDb().prepare("SELECT * FROM instances ORDER BY name COLLATE NOCASE, id").all() as unknown as InstanceRow[];
  return rows.map(toInstance);
}

export function listInstancesForUser(user: CurrentUser): Instance[] {
  if (user.role === "superadmin") return listAllInstances();
  const rows = getDb()
    .prepare(
      `SELECT i.* FROM instances i JOIN user_instances ui ON ui.instance_id = i.id
       WHERE ui.user_id = ? ORDER BY i.name COLLATE NOCASE, i.id`,
    )
    .all(user.id) as unknown as InstanceRow[];
  return rows.map(toInstance);
}

export function getInstanceToken(id: number): string | null {
  const row = getDb().prepare("SELECT token_enc FROM instances WHERE id = ?").get(id) as
    | Pick<InstanceRow, "token_enc">
    | undefined;
  return row ? decryptSecret(row.token_enc) : null;
}

export function getInstance(id: number): Instance | null {
  const row = getDb().prepare("SELECT * FROM instances WHERE id = ?").get(id) as InstanceRow | undefined;
  return row ? toInstance(row) : null;
}

export function createInstance(input: {
  name: string;
  baseUrl: string;
  tokenMode: TokenMode;
  token?: string;
}): number {
  try {
    const { lastInsertRowid } = getDb()
      .prepare("INSERT INTO instances (name, base_url, token_enc, token_mode, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(
        input.name.trim(),
        normalizeBaseUrl(input.baseUrl),
        input.tokenMode === "shared" && input.token ? encryptSecret(input.token.trim()) : "",
        input.tokenMode,
        Date.now(),
      );
    return Number(lastInsertRowid);
  } catch (e) {
    if (isUnique(e)) throw new InstanceError("url_taken", "That GlitchTip URL is already configured.");
    throw e;
  }
}

export function updateInstance(
  id: number,
  patch: { name?: string; baseUrl?: string; token?: string; tokenMode?: TokenMode },
): void {
  const current = getInstance(id);
  if (!current) throw new InstanceError("not_found", "Instance not found.");
  const mode = patch.tokenMode ?? current.tokenMode;
  // per_user instances keep no shared token; shared ones keep the stored one unless a new one is given.
  const tokenEnc = mode === "per_user" ? "" : patch.token ? encryptSecret(patch.token.trim()) : null;
  try {
    getDb()
      .prepare("UPDATE instances SET name = ?, base_url = ?, token_mode = ?, token_enc = COALESCE(?, token_enc) WHERE id = ?")
      .run(
        patch.name?.trim() ?? current.name,
        patch.baseUrl ? normalizeBaseUrl(patch.baseUrl) : current.baseUrl,
        mode,
        tokenEnc,
        id,
      );
  } catch (e) {
    if (isUnique(e)) throw new InstanceError("url_taken", "That GlitchTip URL is already configured.");
    throw e;
  }
}

// ── Per-user tokens (instances in per_user mode) ───────────────────────────

/** undefined: the user has not set one. null: stored but unreadable (key changed). */
export function getUserToken(userId: number, instanceId: number): string | null | undefined {
  const row = getDb()
    .prepare("SELECT token_enc FROM user_tokens WHERE user_id = ? AND instance_id = ?")
    .get(userId, instanceId) as { token_enc: string } | undefined;
  return row ? decryptSecret(row.token_enc) : undefined;
}

export function setUserToken(userId: number, instanceId: number, token: string): void {
  getDb()
    .prepare(
      `INSERT INTO user_tokens (user_id, instance_id, token_enc, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, instance_id) DO UPDATE SET token_enc = excluded.token_enc, created_at = excluded.created_at`,
    )
    .run(userId, instanceId, encryptSecret(token.trim()), Date.now());
}

export function deleteUserToken(userId: number, instanceId: number): void {
  getDb().prepare("DELETE FROM user_tokens WHERE user_id = ? AND instance_id = ?").run(userId, instanceId);
}

export function instanceIdsWithUserToken(userId: number): Set<number> {
  const rows = getDb().prepare("SELECT instance_id FROM user_tokens WHERE user_id = ?").all(userId) as Array<{
    instance_id: number;
  }>;
  return new Set(rows.map((r) => r.instance_id));
}

export function deleteInstance(id: number): void {
  const { changes } = getDb().prepare("DELETE FROM instances WHERE id = ?").run(id);
  if (!changes) throw new InstanceError("not_found", "Instance not found.");
}

export type InstanceContext =
  | { kind: "ok"; user: CurrentUser; instance: ActiveInstance; instances: Instance[] }
  | { kind: "none"; user: CurrentUser; instances: Instance[] }
  | { kind: "needs_token"; user: CurrentUser; instance: Instance; instances: Instance[] }
  | { kind: "token_unreadable"; user: CurrentUser; instance: Instance; instances: Instance[] };

/**
 * Resolves the active instance for this request. The cookie is only a
 * preference: access is always re-checked against what the user may see.
 */
export const getInstanceContext = cache(async (): Promise<InstanceContext> => {
  const user = await getCurrentUser();
  if (!user) throw new NoInstanceError("unauthenticated");

  const instances = listInstancesForUser(user);
  if (!instances.length) return { kind: "none", user, instances };

  const wanted = Number((await cookies()).get(INSTANCE_COOKIE)?.value);
  const instance = instances.find((i) => i.id === wanted) ?? instances[0];

  if (instance.tokenMode === "per_user") {
    const own = getUserToken(user.id, instance.id);
    // Unreadable and missing look the same to the user: they must enter a token again.
    if (!own) return { kind: "needs_token", user, instance, instances };
    return { kind: "ok", user, instance: { ...instance, token: own }, instances };
  }

  const token = getInstanceToken(instance.id);
  if (!token) return { kind: "token_unreadable", user, instance, instances };
  return { kind: "ok", user, instance: { ...instance, token }, instances };
});

export async function requireActiveInstance(): Promise<{ user: CurrentUser; instance: ActiveInstance }> {
  const ctx = await getInstanceContext();
  if (ctx.kind === "ok") return ctx;
  throw new NoInstanceError(ctx.kind);
}

// ── Connection test ────────────────────────────────────────────────────────

/** Token-less check used for per_user instances: GlitchTip serves /api/settings/ publicly. */
export async function probeUrl(baseUrl: string): Promise<ProbeResult> {
  let base: string;
  try {
    base = normalizeBaseUrl(baseUrl);
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  try {
    const res = await fetch(`${base}/api/settings/`, {
      headers: { Accept: "application/json" },
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (res.status >= 300 && res.status < 400) {
      return { ok: false, message: "The server redirected the request. Use the final URL (for example https:// instead of http://)." };
    }
    const body = res.ok ? ((await res.json().catch(() => null)) as { version?: unknown } | null) : null;
    if (!body || typeof body !== "object" || !("version" in body)) {
      return { ok: false, message: "That URL did not return a GlitchTip API response." };
    }
    return { ok: true, message: "GlitchTip found. Each user will add their own token." };
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { ok: false, message: timeout ? "The server did not answer within 8 seconds." : "Could not reach the server. Check the URL, DNS and network access." };
  }
}

export interface ProbeResult {
  ok: boolean;
  message: string;
  account?: string;
  organizations?: number;
}

/** Calls GlitchTip with the token and returns a fixed-vocabulary result: never the raw response. */
export async function probeInstance(baseUrl: string, token: string): Promise<ProbeResult> {
  let base: string;
  try {
    base = normalizeBaseUrl(baseUrl);
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  const get = (path: string) =>
    fetch(`${base}${path}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

  try {
    const me = await get("/api/0/users/me/");
    if (me.status >= 300 && me.status < 400) {
      return { ok: false, message: "The server redirected the request. Use the final URL (for example https:// instead of http://)." };
    }
    if (me.status === 401) return { ok: false, message: "GlitchTip rejected the token (401). Check that it is correct and not revoked." };
    if (me.status === 403) return { ok: false, message: "The token is valid but lacks permissions (403). Create it with read access to your organizations and projects." };
    if (me.status === 404) return { ok: false, message: "No GlitchTip API found at that URL (404). Check the address and any path prefix." };
    if (!me.ok) return { ok: false, message: `GlitchTip answered with HTTP ${me.status}.` };
    const profile = (await me.json().catch(() => null)) as { email?: unknown; username?: unknown } | null;
    if (!profile || (typeof profile.email !== "string" && typeof profile.username !== "string")) {
      return { ok: false, message: "That URL did not return a GlitchTip API response." };
    }

    const orgsRes = await get("/api/0/organizations/");
    const orgs = orgsRes.ok ? ((await orgsRes.json().catch(() => null)) as unknown) : null;
    const account = String(profile.email ?? profile.username);
    if (!Array.isArray(orgs)) {
      return { ok: false, message: "The token cannot list organizations. Create it with organization read access." };
    }
    return { ok: true, message: "Connected.", account, organizations: orgs.length };
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { ok: false, message: timeout ? "The server did not answer within 8 seconds." : "Could not reach the server. Check the URL, DNS and network access." };
  }
}
