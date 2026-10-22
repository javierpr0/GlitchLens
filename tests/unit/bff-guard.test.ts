import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { SESSION_COOKIE, createSession } from "@/lib/auth";
import { crossOriginResponse, guardRequest, isSameOrigin } from "@/lib/bff-guard";
import { getDb } from "@/lib/db";
import { setTwoFactorPolicy } from "@/lib/policy";
import { createUser, type Role } from "@/lib/users";
import { setRequest, withTempDataDir } from "./helpers.ts";

withTempDataDir();

afterEach(() => {
  setRequest(null);
  setTwoFactorPolicy("off");
  getDb().exec("DELETE FROM users");
});

let seq = 0;
const signIn = (role: Role) => {
  const id = createUser({ email: `u${++seq}@x.com`, name: "U", role, passwordHash: "h" });
  setRequest({ cookies: { [SESSION_COOKIE]: createSession(id).token } });
  return id;
};
const req = (method: string, headers: Record<string, string> = {}) =>
  new Request("http://gl.example.com/api/x", { method, headers: { host: "gl.example.com", ...headers } });

describe("isSameOrigin", () => {
  test("reads are always allowed, whatever the headers", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      assert.equal(isSameOrigin(req(method, { origin: "https://evil.example" })), true, method);
    }
  });

  test("a mutation from the same origin passes", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      assert.equal(isSameOrigin(req(method, { origin: "http://gl.example.com" })), true, method);
    }
    assert.equal(isSameOrigin(req("POST", { origin: "https://gl.example.com" })), true, "scheme does not matter, host does");
  });

  test("a mutation from another origin is blocked, including look-alikes", () => {
    for (const origin of [
      "https://evil.example",
      "http://gl.example.com.evil.example",
      "http://evilgl.example.com",
      "http://gl.example.com:8080",
      "http://sub.gl.example.com",
      "null",
      "not a url",
    ]) {
      assert.equal(isSameOrigin(req("POST", { origin })), false, JSON.stringify(origin));
    }
  });

  test("behind a proxy the forwarded host counts, only its first value", () => {
    const behind = (origin: string, forwarded: string) =>
      new Request("http://internal:3000/api/x", { method: "POST", headers: { host: "internal:3000", origin, "x-forwarded-host": forwarded } });
    assert.equal(isSameOrigin(behind("https://gl.example.com", "gl.example.com")), true);
    assert.equal(isSameOrigin(behind("https://gl.example.com", "gl.example.com, internal:3000")), true);
    assert.equal(isSameOrigin(behind("https://evil.example", "gl.example.com")), false);
    assert.equal(isSameOrigin(behind("https://gl.example.com", "evil.example, gl.example.com")), false);
  });

  test("without an Origin header, browsers' Sec-Fetch-Site decides", () => {
    assert.equal(isSameOrigin(req("POST", { "sec-fetch-site": "same-origin" })), true);
    assert.equal(isSameOrigin(req("POST", { "sec-fetch-site": "none" })), true);
    assert.equal(isSameOrigin(req("POST", { "sec-fetch-site": "cross-site" })), false);
    assert.equal(isSameOrigin(req("POST", { "sec-fetch-site": "same-site" })), false);
  });

  test("without either header (curl, servers) a mutation is allowed: the session cookie still has to be there", () => {
    assert.equal(isSameOrigin(req("POST")), true);
    assert.equal(isSameOrigin(req("POST", { origin: "" })), true, "an empty Origin is the same as none: browsers never send one");
  });

  test("crossOriginResponse is a 403", async () => {
    const res = crossOriginResponse();
    assert.equal(res.status, 403);
    assert.match((await res.json()).error, /cross-origin/);
  });
});

describe("guardRequest", () => {
  test("401 without a session", async () => {
    setRequest({ cookies: {} });
    const g = await guardRequest(req("GET"));
    assert.equal(g.response!.status, 401);
    assert.equal(g.user, undefined);
  });

  test("returns the user for a valid session", async () => {
    const id = signIn("member");
    const g = await guardRequest(req("GET"));
    assert.equal(g.user!.id, id);
    assert.equal(g.response, undefined);
  });

  test("403 for a cross-origin mutation, checked before anything about the user", async () => {
    signIn("superadmin");
    const g = await guardRequest(req("POST", { origin: "https://evil.example" }), { superadmin: true });
    assert.equal(g.response!.status, 403);
    assert.match((await g.response!.json()).error, /cross-origin/);
  });

  test("{ superadmin: true } turns members and viewers away", async () => {
    for (const role of ["member", "viewer"] as const) {
      signIn(role);
      assert.equal((await guardRequest(req("GET"), { superadmin: true })).response!.status, 403, role);
    }
    signIn("superadmin");
    assert.ok((await guardRequest(req("GET"), { superadmin: true })).user);
  });

  test("{ write: true } turns viewers away, nobody else", async () => {
    signIn("viewer");
    const denied = await guardRequest(req("POST"), { write: true });
    assert.equal(denied.response!.status, 403);
    assert.match((await denied.response!.json()).error, /read-only/);
    for (const role of ["member", "superadmin"] as const) {
      signIn(role);
      assert.ok((await guardRequest(req("POST"), { write: true })).user, role);
    }
  });

  test("a viewer can still use endpoints that are not marked as writes", async () => {
    signIn("viewer");
    assert.ok((await guardRequest(req("POST"))).user);
  });

  test("an account the 2FA policy still needs to enrol is refused everywhere except the enrolment endpoints", async () => {
    signIn("superadmin");
    setTwoFactorPolicy("superadmins");
    const denied = await guardRequest(req("GET"));
    assert.equal(denied.response!.status, 403);
    assert.equal((await denied.response!.json()).reason, "two_factor_required");
    assert.equal((await guardRequest(req("POST"), { superadmin: true })).response!.status, 403);
    assert.ok((await guardRequest(req("POST"), { allowWithoutTwoFactor: true })).user, "the escape hatch for enrolment");
  });

  test("2FA enforcement does not touch accounts the policy does not cover", async () => {
    signIn("member");
    setTwoFactorPolicy("superadmins");
    assert.ok((await guardRequest(req("GET"))).user);
  });
});
