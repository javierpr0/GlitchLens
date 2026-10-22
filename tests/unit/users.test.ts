import assert from "node:assert/strict";
import { afterEach, describe, mock, test } from "node:test";
import { createSession } from "@/lib/auth";
import { hashPassword } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { createInstance } from "@/lib/instances";
import { lockedFor } from "@/lib/login-throttle";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  UserError,
  changeOwnPassword,
  completeLogin,
  countUsers,
  createFirstSuperadmin,
  createUser,
  deleteUser,
  getUserForSecondFactor,
  listUsers,
  updateOwnName,
  updateUser,
  verifyCurrentPassword,
  verifyLogin,
  type Role,
} from "@/lib/users";
import { freshDatabase, throttleMemory, withTempDataDir } from "./helpers.ts";

withTempDataDir();

afterEach(() => {
  mock.timers.reset();
  const db = getDb();
  db.exec("DELETE FROM users; DELETE FROM instances; DELETE FROM login_attempts; DELETE FROM settings");
  throttleMemory().clear();
});

let seq = 0;
const add = (role: Role = "member", over: { email?: string; instanceIds?: number[]; passwordHash?: string } = {}) =>
  createUser({
    email: over.email ?? `u${++seq}@x.com`,
    name: `User ${seq}`,
    role,
    passwordHash: over.passwordHash ?? "placeholder-hash",
    instanceIds: over.instanceIds,
  });
const inst = (name = `inst${++seq}`) => createInstance({ name, baseUrl: `http://${name}.example.com`, tokenMode: "per_user" });
const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof UserError ? e.code : `other:${(e as Error).message}`;
  }
  return undefined;
};

describe("createUser / createFirstSuperadmin", () => {
  test("stores trimmed fields and returns the new id", () => {
    const id = createUser({ email: "  Ann@X.com ", name: "  Ann  ", role: "viewer", passwordHash: "h" });
    const [u] = listUsers();
    assert.equal(u.id, id);
    assert.equal(u.email, "Ann@X.com");
    assert.equal(u.name, "Ann");
    assert.equal(u.role, "viewer");
    assert.equal(u.active, true);
  });

  test("refuses a duplicate email in any letter case", () => {
    add("member", { email: "dup@x.com" });
    assert.equal(code(() => add("member", { email: "DUP@x.com" })), "email_taken");
    assert.equal(countUsers(), 1);
  });

  test("assigns instances to non-superadmins and ignores them for superadmins", () => {
    const a = inst();
    const b = inst();
    add("member", { email: "m@x.com", instanceIds: [a, b, a] });
    add("superadmin", { email: "s@x.com", instanceIds: [a] });
    const byEmail = Object.fromEntries(listUsers().map((u) => [u.email, u]));
    assert.deepEqual(byEmail["m@x.com"].instanceIds.sort(), [a, b].sort());
    assert.deepEqual(byEmail["s@x.com"].instanceIds, []);
  });

  test("an unknown instance id aborts the whole creation", () => {
    assert.equal(code(() => add("member", { instanceIds: [424242] })), "bad_instances");
    assert.equal(countUsers(), 0, "no half-created user");
  });

  test("createFirstSuperadmin works once and then closes the door", () => {
    const id = createFirstSuperadmin({ email: "root@x.com", name: "Root", passwordHash: "h" });
    assert.equal(listUsers()[0].role, "superadmin");
    assert.ok(id > 0);
    assert.equal(code(() => createFirstSuperadmin({ email: "evil@x.com", name: "Evil", passwordHash: "h" })), "setup_done");
    assert.equal(countUsers(), 1);
  });

  test("createFirstSuperadmin refuses as soon as any user exists", () => {
    add("viewer");
    assert.equal(code(() => createFirstSuperadmin({ email: "root@x.com", name: "Root", passwordHash: "h" })), "setup_done");
  });
});

describe("updateUser", () => {
  test("changes profile fields and returns the email", () => {
    const admin = add("superadmin");
    const id = add("member", { email: "old@x.com" });
    const email = updateUser(id, { name: " New Name ", email: "new@x.com", role: "viewer" }, admin);
    assert.equal(email, "old@x.com", "returns the email as it was found, for the audit trail");
    const u = listUsers().find((x) => x.id === id)!;
    assert.deepEqual([u.name, u.email, u.role], ["New Name", "new@x.com", "viewer"]);
  });

  test("not found, and duplicate email, are reported as such", () => {
    const admin = add("superadmin");
    add("member", { email: "taken@x.com" });
    const id = add("member");
    assert.equal(code(() => updateUser(99999, { name: "x" }, admin)), "not_found");
    assert.equal(code(() => updateUser(id, { email: "TAKEN@x.com" }, admin)), "email_taken");
  });

  test("nobody can change their own role or disable themselves", () => {
    const a = add("superadmin");
    add("superadmin");
    assert.equal(code(() => updateUser(a, { role: "member" }, a)), "self");
    assert.equal(code(() => updateUser(a, { active: false }, a)), "self");
    assert.equal(code(() => updateUser(a, { name: "Renamed" }, a)), undefined, "other edits are fine");
  });

  test("the last active superadmin cannot be demoted or disabled", () => {
    const admin = add("superadmin");
    const only = add("superadmin");
    updateUser(admin, { active: false }, only);
    assert.equal(code(() => updateUser(admin, { role: "member" }, only)), undefined, "already inactive: not counted");
    // `only` is now the sole active superadmin; someone else (another admin) tries to demote them
    const helper = add("superadmin");
    updateUser(helper, { active: false }, only);
    const acting = add("member");
    assert.equal(code(() => updateUser(only, { role: "member" }, acting)), "last_superadmin");
    assert.equal(code(() => updateUser(only, { active: false }, acting)), "last_superadmin");
  });

  test("a superadmin can be demoted once another active one exists", () => {
    const a = add("superadmin");
    const b = add("superadmin");
    assert.equal(code(() => updateUser(a, { role: "member" }, b)), undefined);
  });

  test("a new password or a disabled account ends every session and half-finished login", () => {
    const admin = add("superadmin");
    const id = add("member");
    const db = getDb();
    createSession(id);
    createSession(id);
    db.prepare("INSERT INTO login_challenges (token_hash, user_id, expires_at) VALUES ('c1', ?, ?)").run(id, Date.now() + 1e6);
    updateUser(id, { passwordHash: "new-hash" }, admin);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?").get(id) as { n: number }).n, 0);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM login_challenges WHERE user_id = ?").get(id) as { n: number }).n, 0);

    createSession(id);
    updateUser(id, { active: false }, admin);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?").get(id) as { n: number }).n, 0);
  });

  test("a plain edit leaves sessions alone", () => {
    const admin = add("superadmin");
    const id = add("member");
    createSession(id);
    updateUser(id, { name: "Renamed" }, admin);
    assert.equal((getDb().prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?").get(id) as { n: number }).n, 1);
  });

  test("promoting to superadmin drops instance grants; demoting keeps none until assigned", () => {
    const admin = add("superadmin");
    const i = inst();
    const id = add("member", { instanceIds: [i] });
    updateUser(id, { role: "superadmin" }, admin);
    assert.deepEqual(listUsers().find((u) => u.id === id)!.instanceIds, []);
    updateUser(id, { role: "member" }, admin);
    assert.deepEqual(listUsers().find((u) => u.id === id)!.instanceIds, []);
    updateUser(id, { instanceIds: [i] }, admin);
    assert.deepEqual(listUsers().find((u) => u.id === id)!.instanceIds, [i]);
  });

  test("instanceIds are replaced, and unknown ones are refused atomically", () => {
    const admin = add("superadmin");
    const [a, b] = [inst(), inst()];
    const id = add("member", { instanceIds: [a] });
    updateUser(id, { instanceIds: [b] }, admin);
    assert.deepEqual(listUsers().find((u) => u.id === id)!.instanceIds, [b]);
    assert.equal(code(() => updateUser(id, { name: "X", instanceIds: [b, 31337] }, admin)), "bad_instances");
    assert.deepEqual(listUsers().find((u) => u.id === id)!.instanceIds, [b], "unchanged after the failed update");
    assert.notEqual(listUsers().find((u) => u.id === id)!.name, "X", "and so is the name");
  });
});

describe("deleteUser", () => {
  test("removes the user and everything hanging from them, returning the email", () => {
    const admin = add("superadmin");
    const id = add("member", { email: "bye@x.com" });
    createSession(id);
    assert.equal(deleteUser(id, admin), "bye@x.com");
    assert.equal(listUsers().some((u) => u.id === id), false);
    assert.equal((getDb().prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n, 0);
  });

  test("refuses to delete yourself, a missing user, or the last active superadmin", () => {
    const only = add("superadmin");
    const other = add("member");
    assert.equal(code(() => deleteUser(only, only)), "self");
    assert.equal(code(() => deleteUser(777, only)), "not_found");
    assert.equal(code(() => deleteUser(only, other)), "last_superadmin");
    assert.equal(countUsers(), 2);
  });

  test("a disabled superadmin can be deleted: it was not counted anyway", () => {
    const a = add("superadmin");
    const b = add("superadmin");
    updateUser(b, { active: false }, a);
    assert.equal(code(() => deleteUser(b, a)), undefined);
  });
});

describe("verifyLogin", () => {
  test("accepts the right password and returns the user without the hash", async () => {
    add("member", { email: "ok@x.com", passwordHash: await hashPassword("right-password-1") });
    const r = await verifyLogin("ok@x.com", "right-password-1", null);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.needsTwoFactor, false);
      assert.deepEqual(Object.keys(r.user).sort(), ["email", "id", "name", "role"]);
    }
    assert.ok(getDb().prepare("SELECT last_login_at AS t FROM users WHERE email = 'ok@x.com'").get()!.t, "last_login_at is set");
  });

  test("is case-insensitive on the email and trims it", async () => {
    add("member", { email: "Case@x.com", passwordHash: await hashPassword("right-password-1") });
    assert.equal((await verifyLogin("  CASE@X.COM ", "right-password-1", null)).ok, true);
  });

  test("answers 'invalid' the same way for a wrong password, an unknown email and a disabled account", async () => {
    const admin = add("superadmin");
    const id = add("member", { email: "off@x.com", passwordHash: await hashPassword("right-password-1") });
    updateUser(id, { active: false }, admin);
    add("member", { email: "real@x.com", passwordHash: await hashPassword("right-password-1") });
    for (const [email, pw] of [["real@x.com", "wrong"], ["nobody@x.com", "right-password-1"], ["off@x.com", "right-password-1"]] as const) {
      assert.deepEqual(await verifyLogin(email, pw, null), { ok: false, reason: "invalid" }, email);
    }
  });

  test("locks after five failures and then refuses even the right password", async () => {
    add("member", { email: "lock@x.com", passwordHash: await hashPassword("right-password-1") });
    for (let i = 0; i < 5; i++) await verifyLogin("lock@x.com", "nope", null);
    const r = await verifyLogin("lock@x.com", "right-password-1", null);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.reason, "locked");
    assert.ok(!r.ok && r.reason === "locked" && r.retryAfter > 0);
  });

  test("made-up emails lock too, so the lock does not reveal which accounts exist", async () => {
    for (let i = 0; i < 5; i++) await verifyLogin("ghost@x.com", "nope", null);
    assert.equal((await verifyLogin("ghost@x.com", "nope", null)).ok, false);
    assert.ok(lockedFor("ghost@x.com", null) > 0);
  });

  test("a good login resets the failure counter", async () => {
    add("member", { email: "reset@x.com", passwordHash: await hashPassword("right-password-1") });
    for (let i = 0; i < 4; i++) await verifyLogin("reset@x.com", "nope", null);
    assert.equal((await verifyLogin("reset@x.com", "right-password-1", null)).ok, true);
    for (let i = 0; i < 4; i++) await verifyLogin("reset@x.com", "nope", null);
    assert.equal(lockedFor("reset@x.com", null), 0);
  });

  test("with 2FA on, the password alone does not finish the login or reset the counter", async () => {
    const id = add("member", { email: "tf@x.com", passwordHash: await hashPassword("right-password-1") });
    getDb().prepare("UPDATE users SET totp_enabled = 1 WHERE id = ?").run(id);
    for (let i = 0; i < 3; i++) await verifyLogin("tf@x.com", "nope", null);
    const r = await verifyLogin("tf@x.com", "right-password-1", null);
    assert.equal(r.ok && r.needsTwoFactor, true);
    assert.equal(getDb().prepare("SELECT last_login_at AS t FROM users WHERE id = ?").get(id)!.t, null, "not logged in yet");
    // the three earlier failures still count: two more lock the account
    await verifyLogin("tf@x.com", "nope", null);
    await verifyLogin("tf@x.com", "nope", null);
    assert.ok(lockedFor("tf@x.com", null) > 0);
  });

  test("completeLogin finishes it: clears failures and stamps the time", async () => {
    const id = add("member", { email: "done@x.com" });
    for (let i = 0; i < 3; i++) await verifyLogin("done@x.com", "nope", null);
    completeLogin(id, "done@x.com");
    for (let i = 0; i < 4; i++) await verifyLogin("done@x.com", "nope", null);
    assert.equal(lockedFor("done@x.com", null), 0);
    assert.ok(getDb().prepare("SELECT last_login_at AS t FROM users WHERE id = ?").get(id)!.t);
  });

  test("sheds a burst instead of queueing unlimited password hashing", async () => {
    add("member", { email: "burst@x.com", passwordHash: await hashPassword("right-password-1") });
    const results = await Promise.all(Array.from({ length: 14 }, (_, i) => verifyLogin(`b${i}@x.com`, "nope", null)));
    const busy = results.filter((r) => !r.ok && r.reason === "busy").length;
    assert.ok(busy >= 4, `${busy} of 14 shed`);
    assert.equal(results.filter((r) => !r.ok && r.reason === "invalid").length, 14 - busy);
    // and the server is not stuck afterwards
    assert.equal((await verifyLogin("burst@x.com", "right-password-1", null)).ok, true);
  });
});

describe("verifyCurrentPassword / changeOwnPassword", () => {
  test("accepts the right password and counts wrong ones against the account", async () => {
    const id = add("member", { email: "me@x.com", passwordHash: await hashPassword("right-password-1") });
    const me = { id, email: "me@x.com", name: "Me", role: "member" as const };
    await verifyCurrentPassword(me, "right-password-1", null);
    for (let i = 0; i < 5; i++) assert.equal(await verifyCurrentPassword(me, "nope", null).then(() => "ok", (e) => (e as UserError).code), "bad_password");
    assert.equal(await verifyCurrentPassword(me, "right-password-1", null).then(() => "ok", (e) => (e as UserError).code), "locked");
  });

  test("changeOwnPassword replaces the hash and ends the other sessions but not this one", async () => {
    const id = add("member", { email: "chg@x.com", passwordHash: await hashPassword("old-password-1") });
    const me = { id, email: "chg@x.com", name: "Me", role: "member" as const };
    const keep = createSession(id);
    createSession(id);
    createSession(id);
    const { sha256 } = await import("@/lib/crypto");
    getDb().prepare("INSERT INTO login_challenges (token_hash, user_id, expires_at) VALUES ('ch', ?, ?)").run(id, Date.now() + 1e6);
    await changeOwnPassword(me, "old-password-1", "brand-new-password-2", sha256(keep.token), null);

    const remaining = getDb().prepare("SELECT token_hash FROM sessions WHERE user_id = ?").all(id) as Array<{ token_hash: string }>;
    assert.deepEqual(remaining.map((r) => r.token_hash), [sha256(keep.token)]);
    assert.equal((getDb().prepare("SELECT COUNT(*) AS n FROM login_challenges WHERE user_id = ?").get(id) as { n: number }).n, 0);
    assert.equal((await verifyLogin("chg@x.com", "brand-new-password-2", null)).ok, true);
    assert.equal((await verifyLogin("chg@x.com", "old-password-1", null)).ok, false);
  });

  test("a wrong current password changes nothing", async () => {
    const id = add("member", { email: "keep@x.com", passwordHash: await hashPassword("old-password-1") });
    const me = { id, email: "keep@x.com", name: "Me", role: "member" as const };
    createSession(id);
    await assert.rejects(changeOwnPassword(me, "WRONG", "brand-new-password-2", "", null), (e: UserError) => e.code === "bad_password");
    assert.equal((await verifyLogin("keep@x.com", "old-password-1", null)).ok, true);
    assert.equal((getDb().prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?").get(id) as { n: number }).n, 1);
  });
});

describe("small helpers", () => {
  test("updateOwnName trims", () => {
    const id = add("member");
    updateOwnName(id, "  Fresh Name ");
    assert.equal(listUsers().find((u) => u.id === id)!.name, "Fresh Name");
  });

  test("getUserForSecondFactor only returns active accounts that really have 2FA", () => {
    const admin = add("superadmin");
    const on = add("member");
    const off = add("member");
    const disabled = add("member");
    getDb().prepare("UPDATE users SET totp_enabled = 1 WHERE id IN (?, ?)").run(on, disabled);
    updateUser(disabled, { active: false }, admin);
    assert.equal(getUserForSecondFactor(on)?.id, on);
    assert.equal(getUserForSecondFactor(off), null);
    assert.equal(getUserForSecondFactor(disabled), null);
    assert.equal(getUserForSecondFactor(123456), null);
  });

  test("listUsers reports 2FA and is ordered by creation", () => {
    const a = add("member");
    const b = add("member");
    getDb().prepare("UPDATE users SET totp_enabled = 1 WHERE id = ?").run(b);
    const users = listUsers();
    assert.deepEqual(users.map((u) => u.id), [a, b]);
    assert.deepEqual(users.map((u) => u.twoFactor), [false, true]);
  });

  test("password length limits are sane", () => {
    assert.ok(PASSWORD_MIN >= 10);
    assert.ok(PASSWORD_MAX >= 128 && PASSWORD_MAX > PASSWORD_MIN);
  });

  test("freshDatabase gives an empty database to the next scenario", () => {
    add("member");
    freshDatabase();
    assert.equal(countUsers(), 0);
  });
});
