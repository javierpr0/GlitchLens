import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import type { CurrentUser, Role } from "@/lib/users";

export const SESSION_COOKIE = "glitchlens_session";
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
// Refreshing last_used_at on every request would turn each read into a write.
const TOUCH_EVERY_MS = 10 * 60 * 1000;

interface SessionRow {
  id: number;
  email: string;
  name: string;
  role: Role;
  last_used_at: number;
}

function lookup(token: string): CurrentUser | null {
  const now = Date.now();
  const hash = sha256(token);
  const row = getDb()
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, s.last_used_at FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND s.last_used_at > ? AND u.active = 1`,
    )
    .get(hash, now, now - SESSION_IDLE_MS) as SessionRow | undefined;
  if (!row) return null;
  if (now - row.last_used_at > TOUCH_EVERY_MS) {
    getDb().prepare("UPDATE sessions SET last_used_at = ? WHERE token_hash = ?").run(now, hash);
  }
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

/** Cached per request so layouts, pages and data helpers share one lookup. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? lookup(token) : null;
});

export async function getSessionHash(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? sha256(token) : null;
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireSuperadmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "superadmin") notFound();
  return user;
}

export function createSession(
  userId: number,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): { token: string; expiresAt: number } {
  const db = getDb();
  const now = Date.now();
  const token = randomToken(32);
  const expiresAt = now + SESSION_TTL_MS;
  db.prepare("DELETE FROM sessions WHERE expires_at <= ? OR last_used_at <= ?").run(now, now - SESSION_IDLE_MS);
  db.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_used_at, user_agent, ip) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(sha256(token), userId, now, expiresAt, now, meta.userAgent?.slice(0, 300) ?? null, meta.ip ?? null);
  return { token, expiresAt };
}

export interface SessionInfo {
  /** Public handle: a prefix of the stored hash, useless for forging a cookie. */
  id: string;
  createdAt: number;
  lastUsedAt: number;
  userAgent: string | null;
  current: boolean;
}

const HANDLE_LEN = 12;

export function listSessions(userId: number, currentHash: string | null): SessionInfo[] {
  const rows = getDb()
    .prepare(
      `SELECT token_hash, created_at, last_used_at, user_agent FROM sessions
       WHERE user_id = ? AND expires_at > ? AND last_used_at > ? ORDER BY last_used_at DESC`,
    )
    .all(userId, Date.now(), Date.now() - SESSION_IDLE_MS) as unknown as Array<{
    token_hash: string;
    created_at: number;
    last_used_at: number;
    user_agent: string | null;
  }>;
  return rows.map((r) => ({
    id: r.token_hash.slice(0, HANDLE_LEN),
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
    userAgent: r.user_agent,
    current: r.token_hash === currentHash,
  }));
}

/** Revokes one of the user's own sessions by handle. Never the current one: that is a normal sign out. */
export function revokeSession(userId: number, handle: string, currentHash: string | null): boolean {
  if (!/^[0-9a-f]+$/.test(handle) || handle.length !== HANDLE_LEN) return false;
  const { changes } = getDb()
    .prepare("DELETE FROM sessions WHERE user_id = ? AND substr(token_hash, 1, ?) = ? AND token_hash <> ?")
    .run(userId, HANDLE_LEN, handle, currentHash ?? "");
  return changes > 0;
}

export function revokeOtherSessions(userId: number, currentHash: string | null): number {
  const { changes } = getDb()
    .prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?")
    .run(userId, currentHash ?? "");
  return Number(changes);
}

export function destroySession(token: string): void {
  getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
}

/** `Secure` only on real HTTPS, otherwise login breaks on http://localhost and plain-HTTP LANs. */
export function isSecureRequest(req: Request): boolean {
  const override = process.env.GLITCHLENS_COOKIE_SECURE;
  if (override === "true") return true;
  if (override === "false") return false;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return (proto ?? new URL(req.url).protocol.replace(":", "")) === "https";
}

export function setSessionCookie(
  res: NextResponse,
  req: Request,
  session: { token: string; expiresAt: number },
): void {
  res.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: "/",
    expires: new Date(session.expiresAt),
  });
}

export function clearSessionCookie(res: NextResponse, req: Request): void {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: "/",
    maxAge: 0,
  });
}

