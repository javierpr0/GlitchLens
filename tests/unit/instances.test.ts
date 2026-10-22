import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { SESSION_COOKIE, createSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  INSTANCE_COOKIE,
  InstanceError,
  NoInstanceError,
  createInstance,
  deleteInstance,
  deleteUserToken,
  getInstance,
  getInstanceContext,
  getInstanceToken,
  getUserToken,
  instanceIdsWithUserToken,
  listAllInstances,
  listInstancesForUser,
  normalizeBaseUrl,
  probeInstance,
  probeUrl,
  requireActiveInstance,
  setUserToken,
  updateInstance,
} from "@/lib/instances";
import { setTwoFactorPolicy } from "@/lib/policy";
import { createUser, type CurrentUser, type Role } from "@/lib/users";
import { fakeServer, sendJson, setRequest, withTempDataDir } from "./helpers.ts";

withTempDataDir();

afterEach(() => {
  setRequest(null);
  setTwoFactorPolicy("off");
  getDb().exec("DELETE FROM users; DELETE FROM instances");
});

let seq = 0;
const user = (role: Role = "member", instanceIds: number[] = []): CurrentUser => {
  const email = `u${++seq}@x.com`;
  const id = createUser({ email, name: "U", role, passwordHash: "h", instanceIds });
  return { id, email, name: "U", role };
};
const shared = (name: string, token = "tok-" + name) =>
  createInstance({ name, baseUrl: `http://${name.toLowerCase().replace(/\W+/g, "-")}.example.com`, tokenMode: "shared", token });
const perUser = (name: string) => createInstance({ name, baseUrl: `http://${name.toLowerCase().replace(/\W+/g, "-")}.example.com`, tokenMode: "per_user" });
const signIn = (u: CurrentUser, extraCookies: Record<string, string> = {}) =>
  setRequest({ cookies: { [SESSION_COOKIE]: createSession(u.id).token, ...extraCookies } });

describe("normalizeBaseUrl", () => {
  test("keeps origin and path, drops trailing slashes, query and hash", () => {
    assert.equal(normalizeBaseUrl("https://gt.example.com"), "https://gt.example.com");
    assert.equal(normalizeBaseUrl("https://gt.example.com/"), "https://gt.example.com");
    assert.equal(normalizeBaseUrl("  https://gt.example.com/glitchtip//  "), "https://gt.example.com/glitchtip");
    assert.equal(normalizeBaseUrl("http://127.0.0.1:8000/?x=1#y"), "http://127.0.0.1:8000");
    assert.equal(normalizeBaseUrl("HTTPS://GT.Example.COM"), "https://gt.example.com");
  });

  test("accepts private and local addresses on purpose (self-hosted GlitchTip lives there)", () => {
    for (const u of ["http://localhost:8000", "http://192.168.1.10", "http://10.0.0.5:8080", "http://[::1]:8000"]) {
      assert.doesNotThrow(() => normalizeBaseUrl(u), u);
    }
  });

  test("refuses anything that is not plain http(s) without credentials", () => {
    for (const bad of ["", "gt.example.com", "ftp://x.com", "file:///etc/passwd", "javascript:alert(1)", "http://", "https://user:pw@x.com", "https://user@x.com", "//x.com"]) {
      assert.throws(() => normalizeBaseUrl(bad), (e: InstanceError) => e.code === "invalid_url", bad);
    }
  });
});

describe("instance records", () => {
  test("a shared token is encrypted at rest and readable back", () => {
    const id = shared("Prod", "super-secret-token-123");
    const raw = getDb().prepare("SELECT token_enc FROM instances WHERE id = ?").get(id)!.token_enc as string;
    assert.ok(!raw.includes("super-secret-token-123"));
    assert.equal(getInstanceToken(id), "super-secret-token-123");
  });

  test("a per-user instance has no shared token at all", () => {
    const id = perUser("Personal");
    assert.equal(getDb().prepare("SELECT token_enc FROM instances WHERE id = ?").get(id)!.token_enc, "");
    assert.equal(getInstanceToken(id), null);
    assert.equal(getInstance(id)!.tokenMode, "per_user");
  });

  test("the public view never carries the token", () => {
    shared("Prod", "do-not-leak");
    assert.equal(JSON.stringify(listAllInstances()).includes("do-not-leak"), false);
    assert.deepEqual(Object.keys(listAllInstances()[0]).sort(), ["baseUrl", "createdAt", "id", "name", "tokenMode"]);
  });

  test("the URL is unique, however it is spelled", () => {
    shared("A");
    for (const dup of ["http://a.example.com", "http://A.EXAMPLE.com/", "http://a.example.com/?x=1"]) {
      assert.throws(() => createInstance({ name: "B", baseUrl: dup, tokenMode: "shared", token: "t" }), (e: InstanceError) => e.code === "url_taken", dup);
    }
  });

  test("lists are ordered by name, ignoring case", () => {
    shared("beta");
    shared("Alpha");
    shared("Charlie");
    assert.deepEqual(listAllInstances().map((i) => i.name), ["Alpha", "beta", "Charlie"]);
  });

  test("update changes the name and keeps the token unless a new one is given", () => {
    const id = shared("Old", "first-token");
    updateInstance(id, { name: "  New  " });
    assert.equal(getInstance(id)!.name, "New");
    assert.equal(getInstanceToken(id), "first-token");
    updateInstance(id, { token: "second-token" });
    assert.equal(getInstanceToken(id), "second-token");
  });

  test("update reports a missing instance and a clashing URL", () => {
    shared("A");
    const b = shared("B");
    assert.throws(() => updateInstance(9999, { name: "x" }), (e: InstanceError) => e.code === "not_found");
    assert.throws(() => updateInstance(b, { baseUrl: "http://a.example.com" }), (e: InstanceError) => e.code === "url_taken");
  });

  test("switching to per-user mode discards the shared token", () => {
    const id = shared("Switch", "shared-token");
    updateInstance(id, { tokenMode: "per_user" });
    assert.equal(getInstanceToken(id), null);
    assert.equal(getInstance(id)!.tokenMode, "per_user");
  });

  test("switching back to shared stores the new token", () => {
    const id = perUser("Back");
    updateInstance(id, { tokenMode: "shared", token: "fresh" });
    assert.equal(getInstanceToken(id), "fresh");
  });

  test("changing the URL deletes the personal tokens issued for the old one", () => {
    const id = perUser("Moving");
    const u = user("member", [id]);
    setUserToken(u.id, id, "personal");
    updateInstance(id, { name: "Moving 2" });
    assert.equal(getUserToken(u.id, id), "personal", "a rename keeps them");
    updateInstance(id, { baseUrl: "http://elsewhere.example.com" });
    assert.equal(getUserToken(u.id, id), undefined, "a new address must never receive the old tokens");
  });

  test("delete removes the instance and what points at it", () => {
    const id = perUser("Gone");
    const u = user("member", [id]);
    setUserToken(u.id, id, "t");
    deleteInstance(id);
    assert.equal(getInstance(id), null);
    assert.deepEqual(listInstancesForUser(u), []);
    assert.equal(getUserToken(u.id, id), undefined);
    assert.throws(() => deleteInstance(id), (e: InstanceError) => e.code === "not_found");
  });
});

describe("who can see which instance", () => {
  test("superadmins see all, members only what they were given, in name order", () => {
    const [a, b, c] = [shared("Charlie"), shared("Alpha"), shared("Bravo")];
    const admin = user("superadmin");
    const member = user("member", [a, b]);
    assert.deepEqual(listInstancesForUser(admin).map((i) => i.name), ["Alpha", "Bravo", "Charlie"]);
    assert.deepEqual(listInstancesForUser(member).map((i) => i.name), ["Alpha", "Charlie"]);
    assert.deepEqual(listInstancesForUser(user("viewer")), []);
    assert.ok(c);
  });
});

describe("personal tokens", () => {
  test("have three states: none, readable and unreadable", () => {
    const id = perUser("P");
    const u = user("member", [id]);
    assert.equal(getUserToken(u.id, id), undefined);
    setUserToken(u.id, id, "  my-token  ");
    assert.equal(getUserToken(u.id, id), "my-token");
    getDb().prepare("UPDATE user_tokens SET token_enc = 'garbage' WHERE user_id = ?").run(u.id);
    assert.equal(getUserToken(u.id, id), null);
  });

  test("are encrypted at rest and replaced by a second save", () => {
    const id = perUser("P");
    const u = user("member", [id]);
    setUserToken(u.id, id, "first-secret");
    setUserToken(u.id, id, "second-secret");
    const rows = getDb().prepare("SELECT token_enc FROM user_tokens").all() as Array<{ token_enc: string }>;
    assert.equal(rows.length, 1);
    assert.ok(!rows[0].token_enc.includes("secret"));
    assert.equal(getUserToken(u.id, id), "second-secret");
  });

  test("can be removed and listed per user", () => {
    const [a, b] = [perUser("A"), perUser("B")];
    const u = user("member", [a, b]);
    const other = user("member", [a]);
    setUserToken(u.id, a, "1");
    setUserToken(u.id, b, "2");
    setUserToken(other.id, a, "3");
    assert.deepEqual([...instanceIdsWithUserToken(u.id)].sort(), [a, b].sort());
    deleteUserToken(u.id, a);
    assert.deepEqual([...instanceIdsWithUserToken(u.id)], [b]);
    assert.equal(getUserToken(other.id, a), "3", "someone else's token is untouched");
  });
});

describe("getInstanceContext", () => {
  test("refuses a request with no session", async () => {
    setRequest({ cookies: {} });
    await assert.rejects(getInstanceContext(), (e: NoInstanceError) => e.reason === "unauthenticated");
    setRequest({ cookies: { [SESSION_COOKIE]: "forged" } });
    await assert.rejects(getInstanceContext(), (e: NoInstanceError) => e.reason === "unauthenticated");
  });

  test("says 'none' when the user has no instance", async () => {
    signIn(user("member"));
    const ctx = await getInstanceContext();
    assert.equal(ctx.kind, "none");
    await assert.rejects(requireActiveInstance(), (e: NoInstanceError) => e.reason === "none");
  });

  test("picks the first allowed instance, with its token, when the cookie says nothing", async () => {
    const [a, b] = [shared("Alpha", "tok-a"), shared("Bravo", "tok-b")];
    signIn(user("member", [a, b]));
    const ctx = await getInstanceContext();
    assert.equal(ctx.kind, "ok");
    if (ctx.kind === "ok") {
      assert.equal(ctx.instance.name, "Alpha");
      assert.equal(ctx.instance.token, "tok-a");
      assert.equal(ctx.instances.length, 2);
    }
  });

  test("honours the cookie preference among the allowed instances", async () => {
    const [a, b] = [shared("Alpha"), shared("Bravo", "tok-b")];
    signIn(user("member", [a, b]), { [INSTANCE_COOKIE]: String(b) });
    const ctx = await getInstanceContext();
    assert.equal(ctx.kind === "ok" && ctx.instance.token, "tok-b");
  });

  test("a forged cookie for an instance the user cannot see falls back to an allowed one", async () => {
    const [mine, theirs] = [shared("Mine", "tok-mine"), shared("Theirs", "tok-theirs")];
    signIn(user("member", [mine]), { [INSTANCE_COOKIE]: String(theirs) });
    const ctx = await getInstanceContext();
    assert.equal(ctx.kind === "ok" && ctx.instance.name, "Mine");
    assert.equal(JSON.stringify(ctx).includes("tok-theirs"), false, "the other instance's token never appears");
  });

  test("garbage in the cookie is just ignored", async () => {
    const a = shared("Alpha");
    for (const junk of ["", "abc", "-1", "1e9", "NaN", "0", "99999999999"]) {
      signIn(user("member", [a]), { [INSTANCE_COOKIE]: junk });
      assert.equal((await getInstanceContext()).kind, "ok", JSON.stringify(junk));
    }
  });

  test("a shared instance whose token cannot be decrypted is reported, not guessed", async () => {
    const id = shared("Broken");
    getDb().prepare("UPDATE instances SET token_enc = 'garbage' WHERE id = ?").run(id);
    signIn(user("member", [id]));
    const ctx = await getInstanceContext();
    assert.equal(ctx.kind, "token_unreadable");
    await assert.rejects(requireActiveInstance(), (e: NoInstanceError) => e.reason === "token_unreadable");
  });

  test("a per-user instance asks for the user's own token, and then uses it", async () => {
    const id = perUser("Personal");
    const u = user("member", [id]);
    signIn(u);
    assert.equal((await getInstanceContext()).kind, "needs_token");
    setUserToken(u.id, id, "my-own");
    const ctx = await getInstanceContext();
    assert.equal(ctx.kind === "ok" && ctx.instance.token, "my-own");
  });

  test("an unreadable personal token counts as missing", async () => {
    const id = perUser("Personal");
    const u = user("member", [id]);
    setUserToken(u.id, id, "x");
    getDb().prepare("UPDATE user_tokens SET token_enc = 'garbage'").run();
    signIn(u);
    assert.equal((await getInstanceContext()).kind, "needs_token");
  });

  test("an account that still has to enrol in 2FA gets no GlitchTip data at all", async () => {
    const id = shared("Alpha", "tok-a");
    const admin = user("superadmin");
    setTwoFactorPolicy("all");
    signIn(admin);
    const ctx = await getInstanceContext();
    assert.equal(ctx.kind, "two_factor_required");
    assert.equal(JSON.stringify(ctx).includes("tok-a"), false);
    await assert.rejects(requireActiveInstance(), (e: NoInstanceError) => e.reason === "two_factor_required");
    assert.ok(id);
  });
});

describe("probeInstance / probeUrl", () => {
  const ME = { id: "1", email: "owner@example.com" };

  test("accepts a working token and reports the account and organization count", async () => {
    const srv = await fakeServer((req, res) => {
      if (req.url === "/api/0/users/me/") return sendJson(res, 200, ME);
      if (req.url === "/api/0/organizations/") return sendJson(res, 200, [{ slug: "a" }, { slug: "b" }]);
      sendJson(res, 404, {});
    });
    const r = await probeInstance(srv.url, "good-token");
    assert.deepEqual(r, { ok: true, message: "Connected.", account: "owner@example.com", organizations: 2 });
    assert.equal(srv.requests[0].headers.authorization, "Bearer good-token");
  });

  test("falls back to the username when there is no email", async () => {
    const srv = await fakeServer((req, res) =>
      req.url === "/api/0/users/me/" ? sendJson(res, 200, { username: "robot" }) : sendJson(res, 200, []),
    );
    assert.equal((await probeInstance(srv.url, "t")).account, "robot");
  });

  const status = (code: number, expect: RegExp) =>
    test(`explains HTTP ${code} with a fixed message, never the server's body`, async () => {
      const srv = await fakeServer((_req, res) => sendJson(res, code, { detail: "SECRET-INTERNAL-DETAIL" }));
      const r = await probeInstance(srv.url, "t");
      assert.equal(r.ok, false);
      assert.match(r.message, expect);
      assert.ok(!JSON.stringify(r).includes("SECRET-INTERNAL-DETAIL"));
    });
  status(401, /rejected the token/);
  status(403, /lacks permissions/);
  status(404, /No GlitchTip API/);
  status(500, /HTTP 500/);

  test("does not follow redirects and says what to fix", async () => {
    const srv = await fakeServer((_req, res) => { res.writeHead(302, { location: "https://elsewhere.example.com/" }); res.end(); });
    const r = await probeInstance(srv.url, "t");
    assert.equal(r.ok, false);
    assert.match(r.message, /redirected/);
    assert.equal(srv.requests.length, 1, "the redirect target was never contacted");
  });

  test("rejects something that is not a GlitchTip API", async () => {
    for (const body of [{ hello: "world" }, "plain text", null]) {
      const srv = await fakeServer((_req, res) => sendJson(res, 200, body));
      const r = await probeInstance(srv.url, "t");
      assert.equal(r.ok, false);
      assert.match(r.message, /did not return a GlitchTip API response/);
    }
  });

  test("a token that cannot list organizations is not good enough", async () => {
    const srv = await fakeServer((req, res) => (req.url === "/api/0/users/me/" ? sendJson(res, 200, ME) : sendJson(res, 403, {})));
    const r = await probeInstance(srv.url, "t");
    assert.equal(r.ok, false);
    assert.match(r.message, /cannot list organizations/);
  });

  test("an address nobody listens on is reported plainly", async () => {
    const r = await probeInstance("http://127.0.0.1:1", "t");
    assert.equal(r.ok, false);
    assert.match(r.message, /Could not reach the server/);
  });

  test("a malformed URL is reported without making a request", async () => {
    for (const bad of ["", "ftp://x.com", "https://user:pw@x.com"]) {
      const r = await probeInstance(bad, "t");
      assert.equal(r.ok, false, bad);
    }
  });

  test("probeUrl checks the public /api/settings/ endpoint, with no credentials sent", async () => {
    const srv = await fakeServer((req, res) => (req.url === "/api/settings/" ? sendJson(res, 200, { version: "6.2.6" }) : sendJson(res, 404, {})));
    const r = await probeUrl(srv.url);
    assert.equal(r.ok, true);
    assert.equal(srv.requests[0].headers.authorization, undefined);
  });

  test("probeUrl rejects non-GlitchTip servers, redirects and dead addresses", async () => {
    const other = await fakeServer((_req, res) => sendJson(res, 200, { nope: true }));
    assert.equal((await probeUrl(other.url)).ok, false);
    const redirecting = await fakeServer((_req, res) => { res.writeHead(301, { location: "https://x.example.com" }); res.end(); });
    assert.match((await probeUrl(redirecting.url)).message, /redirected/);
    assert.match((await probeUrl("http://127.0.0.1:1")).message, /Could not reach/);
  });
});
