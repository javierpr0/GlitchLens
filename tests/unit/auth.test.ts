import assert from "node:assert/strict";
import { afterEach, describe, mock, test } from "node:test";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createSession,
  destroySession,
  getCurrentUser,
  getSessionHash,
  isSecureRequest,
  listSessions,
  requireSuperadmin,
  requireUser,
  revokeOtherSessions,
  revokeSession,
  setSessionCookie,
} from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { setTwoFactorPolicy } from "@/lib/policy";
import { createUser, type Role } from "@/lib/users";
import { setRequest, withTempDataDir } from "./helpers.ts";

withTempDataDir();
const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;

afterEach(() => {
  mock.timers.reset();
  setRequest(null);
  setTwoFactorPolicy("off");
  delete process.env.GLITCHLENS_COOKIE_SECURE;
  getDb().exec("DELETE FROM users");
});

let seq = 0;
const mk = (role: Role = "member") => createUser({ email: `u${++seq}@x.com`, name: "U", role, passwordHash: "h" });
const sessionRow = (token: string) =>
  getDb().prepare("SELECT * FROM sessions WHERE token_hash = ?").get(sha256(token)) as
    | { created_at: number; expires_at: number; last_used_at: number; user_agent: string | null; ip: string | null; user_id: number }
    | undefined;
const as = (token: string | undefined) => setRequest({ cookies: token ? { [SESSION_COOKIE]: token } : {} });

describe("createSession", () => {
  test("returns a random token and stores only its hash", () => {
    const id = mk();
    const a = createSession(id);
    const b = createSession(id);
    assert.notEqual(a.token, b.token);
    assert.match(a.token, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(sessionRow(a.token));
    const stored = (getDb().prepare("SELECT token_hash FROM sessions").all() as Array<{ token_hash: string }>).map((r) => r.token_hash);
    assert.ok(!stored.includes(a.token), "the raw token is never stored");
  });

  test("expires after 14 days and records the device", () => {
    const id = mk();
    const { token, expiresAt } = createSession(id, { userAgent: "UA/1.0", ip: "1.2.3.4" });
    assert.ok(Math.abs(expiresAt - (Date.now() + 14 * DAY)) < 5000);
    const row = sessionRow(token)!;
    assert.equal(row.user_agent, "UA/1.0");
    assert.equal(row.ip, "1.2.3.4");
  });

  test("caps an absurdly long user agent", () => {
    const { token } = createSession(mk(), { userAgent: "x".repeat(5000) });
    assert.equal(sessionRow(token)!.user_agent!.length, 300);
  });

  test("cleans out sessions that already expired or went idle", () => {
    const id = mk();
    const db = getDb();
    const now = Date.now();
    db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_used_at) VALUES ('expired', ?, 0, ?, ?)").run(id, now - 1000, now);
    db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_used_at) VALUES ('idle', ?, 0, ?, ?)").run(id, now + DAY, now - 8 * DAY);
    createSession(id);
    const left = (db.prepare("SELECT token_hash FROM sessions").all() as Array<{ token_hash: string }>).map((r) => r.token_hash);
    assert.ok(!left.includes("expired") && !left.includes("idle"));
  });
});

describe("getCurrentUser", () => {
  test("resolves a valid session to the user, without any secret", async () => {
    const id = mk("superadmin");
    as(createSession(id).token);
    const u = await getCurrentUser();
    assert.deepEqual({ id: u!.id, role: u!.role }, { id, role: "superadmin" });
    assert.ok(!("password_hash" in u!) && !("passwordHash" in u!));
  });

  test("is null with no cookie, an empty cookie or a forged token", async () => {
    for (const token of [undefined, "", "forged", "x".repeat(43)]) {
      as(token);
      assert.equal(await getCurrentUser(), null, JSON.stringify(token));
    }
  });

  test("is null after the session is destroyed", async () => {
    const { token } = createSession(mk());
    as(token);
    assert.ok(await getCurrentUser());
    destroySession(token);
    assert.equal(await getCurrentUser(), null);
  });

  test("is null once the session is past its absolute expiry", async () => {
    const { token } = createSession(mk());
    getDb().prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").run(Date.now() - 1, sha256(token));
    as(token);
    assert.equal(await getCurrentUser(), null);
  });

  test("is null after 7 days idle, even though the absolute expiry is far away", async () => {
    const { token } = createSession(mk());
    getDb().prepare("UPDATE sessions SET last_used_at = ? WHERE token_hash = ?").run(Date.now() - 7 * DAY - 1000, sha256(token));
    as(token);
    assert.equal(await getCurrentUser(), null);
  });

  test("is null for a disabled account, immediately", async () => {
    const id = mk();
    const { token } = createSession(id);
    as(token);
    assert.ok(await getCurrentUser());
    getDb().prepare("UPDATE users SET active = 0 WHERE id = ?").run(id);
    assert.equal(await getCurrentUser(), null);
  });

  test("sees a role change on the very next request", async () => {
    const id = mk("member");
    as(createSession(id).token);
    assert.equal((await getCurrentUser())!.role, "member");
    getDb().prepare("UPDATE users SET role = 'viewer' WHERE id = ?").run(id);
    assert.equal((await getCurrentUser())!.role, "viewer");
  });

  test("refreshes last_used_at at most every 10 minutes, so a read is not a write", async () => {
    mock.timers.enable({ apis: ["Date"], now: 10_000_000_000 });
    const { token } = createSession(mk());
    as(token);
    const base = sessionRow(token)!.last_used_at;
    mock.timers.tick(5 * MIN);
    await getCurrentUser();
    assert.equal(sessionRow(token)!.last_used_at, base, "5 minutes: untouched");
    mock.timers.tick(6 * MIN);
    await getCurrentUser();
    assert.equal(sessionRow(token)!.last_used_at, base + 11 * MIN, "11 minutes: refreshed");
  });

  test("flags an account the 2FA policy covers that has not enrolled", async () => {
    const admin = mk("superadmin");
    const member = mk("member");
    as(createSession(admin).token);
    assert.equal((await getCurrentUser())!.needsTwoFactor, false);
    setTwoFactorPolicy("superadmins");
    assert.equal((await getCurrentUser())!.needsTwoFactor, true);
    as(createSession(member).token);
    assert.equal((await getCurrentUser())!.needsTwoFactor, false, "members are not covered by 'superadmins'");
    setTwoFactorPolicy("all");
    assert.equal((await getCurrentUser())!.needsTwoFactor, true);
    getDb().prepare("UPDATE users SET totp_enabled = 1 WHERE id = ?").run(member);
    assert.equal((await getCurrentUser())!.needsTwoFactor, false, "enrolled accounts are fine");
  });
});

describe("getSessionHash", () => {
  test("is the hash of the cookie, or null", async () => {
    const { token } = createSession(mk());
    as(token);
    assert.equal(await getSessionHash(), sha256(token));
    as(undefined);
    assert.equal(await getSessionHash(), null);
  });
});

describe("requireUser / requireSuperadmin", () => {
  test("send a visitor to /login", async () => {
    as(undefined);
    await assert.rejects(requireUser(), (e: { kind?: string; url?: string }) => e.kind === "redirect" && e.url === "/login");
    await assert.rejects(requireSuperadmin(), (e: { kind?: string; url?: string }) => e.kind === "redirect" && e.url === "/login");
  });

  test("requireSuperadmin hides the page from everyone else as a 404", async () => {
    for (const role of ["member", "viewer"] as const) {
      as(createSession(mk(role)).token);
      await assert.rejects(requireSuperadmin(), (e: { kind?: string }) => e.kind === "not-found", role);
    }
  });

  test("requireSuperadmin lets an enrolled superadmin in, and sends an unenrolled one to enrol", async () => {
    const admin = mk("superadmin");
    as(createSession(admin).token);
    assert.equal((await requireSuperadmin()).id, admin);
    setTwoFactorPolicy("superadmins");
    await assert.rejects(requireSuperadmin(), (e: { kind?: string; url?: string }) => e.kind === "redirect" && e.url === "/settings/account");
    assert.equal((await requireUser()).id, admin, "but the account page itself stays reachable");
  });
});

describe("listing and revoking sessions", () => {
  test("lists only the user's own live sessions and marks the current one", () => {
    const me = mk();
    const other = mk();
    const s1 = createSession(me, { userAgent: "A" });
    const s2 = createSession(me, { userAgent: "B" });
    createSession(other);
    const list = listSessions(me, sha256(s1.token));
    assert.equal(list.length, 2);
    assert.deepEqual(list.filter((s) => s.current).map((s) => s.userAgent), ["A"]);
    assert.ok(list.every((s) => s.id.length === 12 && /^[0-9a-f]+$/.test(s.id)), "short public handles");
    assert.ok(!JSON.stringify(list).includes(sha256(s2.token)), "never the full hash");
  });

  test("skips expired and idle sessions", () => {
    const me = mk();
    const live = createSession(me);
    const dead = createSession(me);
    const db = getDb();
    db.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").run(Date.now() - 1, sha256(dead.token));
    assert.deepEqual(listSessions(me, null).length, 1);
    db.prepare("UPDATE sessions SET last_used_at = ? WHERE token_hash = ?").run(Date.now() - 8 * DAY, sha256(live.token));
    assert.equal(listSessions(me, null).length, 0);
  });

  test("revokeSession ends one other session by its handle", async () => {
    const me = mk();
    const keep = createSession(me);
    const drop = createSession(me);
    const handle = listSessions(me, sha256(keep.token)).find((s) => !s.current)!.id;
    assert.equal(revokeSession(me, handle, sha256(keep.token)), true);
    as(drop.token);
    assert.equal(await getCurrentUser(), null);
    as(keep.token);
    assert.ok(await getCurrentUser());
  });

  test("revokeSession refuses the current session, other people's sessions and malformed handles", () => {
    const me = mk();
    const them = mk();
    const mine = createSession(me);
    const theirs = createSession(them);
    const myHandle = sha256(mine.token).slice(0, 12);
    const theirHandle = sha256(theirs.token).slice(0, 12);
    assert.equal(revokeSession(me, myHandle, sha256(mine.token)), false, "current session: use sign out");
    assert.equal(revokeSession(me, theirHandle, sha256(mine.token)), false, "someone else's");
    for (const bad of ["", "zz", "%", "abc", "ABCDEF123456", "0123456789abc", "0123456789a%", "'; DROP TABLE"]) {
      assert.equal(revokeSession(me, bad, sha256(mine.token)), false, bad);
    }
    assert.equal(listSessions(them, null).length, 1);
  });

  test("revokeOtherSessions keeps only the current one", () => {
    const me = mk();
    const keep = createSession(me);
    createSession(me);
    createSession(me);
    assert.equal(revokeOtherSessions(me, sha256(keep.token)), 2);
    assert.equal(listSessions(me, null).length, 1);
    assert.equal(revokeOtherSessions(me, sha256(keep.token)), 0);
  });
});

describe("cookies", () => {
  const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

  test("isSecureRequest follows the real protocol or X-Forwarded-Proto", () => {
    assert.equal(isSecureRequest(req("http://localhost:3000/")), false);
    assert.equal(isSecureRequest(req("https://gl.example.com/")), true);
    assert.equal(isSecureRequest(req("http://internal/", { "x-forwarded-proto": "https" })), true);
    assert.equal(isSecureRequest(req("http://internal/", { "x-forwarded-proto": "https, http" })), true);
    assert.equal(isSecureRequest(req("https://gl.example.com/", { "x-forwarded-proto": "http" })), false, "the proxy header wins");
  });

  test("GLITCHLENS_COOKIE_SECURE overrides both ways", () => {
    process.env.GLITCHLENS_COOKIE_SECURE = "true";
    assert.equal(isSecureRequest(req("http://localhost/")), true);
    process.env.GLITCHLENS_COOKIE_SECURE = "false";
    assert.equal(isSecureRequest(req("https://gl.example.com/")), false);
    process.env.GLITCHLENS_COOKIE_SECURE = "maybe";
    assert.equal(isSecureRequest(req("https://gl.example.com/")), true, "anything else is ignored");
  });

  test("the session cookie is HttpOnly, SameSite=Lax, site-wide, expiring with the session", () => {
    const res = NextResponse.json({});
    const expiresAt = Date.now() + 14 * DAY;
    setSessionCookie(res, req("https://gl.example.com/"), { token: "tok", expiresAt });
    const c = res.cookies.get(SESSION_COOKIE)!;
    assert.equal(c.value, "tok");
    assert.equal(c.httpOnly, true);
    assert.equal(c.sameSite, "lax");
    assert.equal(c.path, "/");
    assert.equal(c.secure, true);
    assert.equal(new Date(c.expires as number | Date).getTime(), new Date(expiresAt).getTime());
  });

  test("Secure is off on plain HTTP so login still works on localhost", () => {
    const res = NextResponse.json({});
    setSessionCookie(res, req("http://localhost:3000/"), { token: "tok", expiresAt: Date.now() + 1000 });
    assert.equal(res.cookies.get(SESSION_COOKIE)!.secure, false);
  });

  test("clearSessionCookie empties and expires it", () => {
    const res = NextResponse.json({});
    clearSessionCookie(res, req("https://gl.example.com/"));
    const c = res.cookies.get(SESSION_COOKIE)!;
    assert.equal(c.value, "");
    assert.equal(c.maxAge, 0);
    assert.equal(c.httpOnly, true);
  });
});
