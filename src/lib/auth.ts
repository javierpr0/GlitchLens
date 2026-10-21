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

interface SessionRow {
  id: number;
  email: string;
  name: string;
  role: Role;
}

function lookup(token: string): CurrentUser | null {
  const row = getDb()
    .prepare(
      `SELECT u.id, u.email, u.name, u.role FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
    )
    .get(sha256(token), Date.now()) as SessionRow | undefined;
  return row ?? null;
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

export function createSession(userId: number): { token: string; expiresAt: number } {
  const db = getDb();
  const now = Date.now();
  const token = randomToken(32);
  const expiresAt = now + SESSION_TTL_MS;
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
  db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    sha256(token),
    userId,
    now,
    expiresAt,
  );
  return { token, expiresAt };
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

