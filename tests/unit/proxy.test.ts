import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const originalEnv = process.env.NODE_ENV;
afterEach(() => {
  (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
});

const call = (path: string, init: { cookie?: string; headers?: Record<string, string>; method?: string } = {}) =>
  proxy(
    new NextRequest(`http://gl.example.com${path}`, {
      method: init.method ?? "GET",
      headers: { ...(init.cookie ? { cookie: init.cookie } : {}), ...init.headers },
    }),
  );
const SESSION = "glitchlens_session=abc";
const csp = (res: Response) => res.headers.get("content-security-policy") ?? "";
const nonceOf = (res: Response) => csp(res).match(/'nonce-([^']+)'/)?.[1];

describe("access", () => {
  test("a visitor without a cookie is sent to /login, remembering where they were going", () => {
    const res = call("/issues");
    assert.equal(res.status, 307);
    const to = new URL(res.headers.get("location")!);
    assert.equal(to.pathname, "/login");
    assert.equal(to.searchParams.get("from"), "/issues");
  });

  test("the home page redirect carries no 'from'", () => {
    assert.equal(new URL(call("/").headers.get("location")!).search, "");
  });

  test("the redirect drops the original query string", () => {
    const to = new URL(call("/issues?query=secret").headers.get("location")!);
    assert.equal(to.searchParams.get("from"), "/issues");
    assert.equal(to.searchParams.has("query"), false);
  });

  test("API calls without a cookie are a JSON 401, not a redirect", async () => {
    const res = call("/api/glitchtip/organizations");
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "unauthorized" });
  });

  test("login, setup, logout, health and 2FA stay open without a cookie", () => {
    for (const path of ["/login", "/setup", "/api/setup", "/api/auth/login", "/api/auth/login/2fa", "/api/auth/logout", "/api/health"]) {
      assert.notEqual(call(path).status, 401, path);
      assert.equal(call(path).headers.get("location"), null, path);
    }
  });

  test("everything else lets a request with a session cookie through (the real check happens later)", () => {
    for (const path of ["/", "/issues", "/settings/users", "/api/admin/users", "/api/glitchtip/x"]) {
      const res = call(path, { cookie: SESSION });
      assert.equal(res.headers.get("location"), null, path);
      assert.notEqual(res.status, 401, path);
    }
  });

  test("a look-alike cookie name is not a session", () => {
    assert.equal(call("/issues", { cookie: "not_glitchlens_session=abc" }).status, 307);
  });

  test("the admin routes are not public just because they share a prefix with public ones", () => {
    assert.equal(call("/api/auth/login/extra").status, 401);
    assert.equal(call("/api/setupx").status, 401);
    assert.equal(call("/login/").status, 307, "even a trailing slash is not special-cased into being public");
  });
});

describe("Content-Security-Policy", () => {
  test("is set on pages, with a nonce that Next can read from the request", () => {
    const res = call("/login");
    const nonce = nonceOf(res);
    assert.ok(nonce && nonce.length >= 20);
    assert.equal(res.headers.get("x-middleware-request-x-nonce"), nonce);
    assert.ok(res.headers.get("x-middleware-request-content-security-policy")?.includes(`'nonce-${nonce}'`));
  });

  test("uses a fresh nonce on every request", () => {
    const seen = new Set(Array.from({ length: 50 }, () => nonceOf(call("/login"))));
    assert.equal(seen.size, 50);
  });

  test("scripts are strict: nonce and strict-dynamic only, no inline or eval in production", () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    const policy = csp(call("/login"));
    const script = policy.split("; ").find((d) => d.startsWith("script-src"))!;
    assert.match(script, /^script-src 'self' 'nonce-[^']+' 'strict-dynamic'$/);
    assert.doesNotMatch(script, /unsafe-/);
  });

  test("development adds what hot reload needs, and only there", () => {
    (process.env as Record<string, string>).NODE_ENV = "development";
    const dev = csp(call("/login"));
    assert.match(dev, /'unsafe-eval'/);
    assert.match(dev, /connect-src 'self' ws: wss:/);
    (process.env as Record<string, string>).NODE_ENV = "production";
    const prod = csp(call("/login"));
    assert.doesNotMatch(prod, /unsafe-eval/);
    assert.doesNotMatch(prod, /ws:/);
  });

  test("blocks plugins, framing, foreign <base> and cross-site form posts, and allows no third parties", () => {
    const policy = csp(call("/login"));
    for (const d of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"]) {
      assert.ok(policy.split("; ").includes(d), d);
    }
    assert.doesNotMatch(policy, /https?:\/\//);
  });

  test("is not added to API responses or prefetches", () => {
    assert.equal(csp(call("/api/health")), "");
    assert.equal(csp(call("/issues", { cookie: SESSION, headers: { "next-router-prefetch": "1" } })), "");
    assert.equal(csp(call("/issues", { cookie: SESSION, headers: { purpose: "prefetch" } })), "");
  });

  test("redirects to /login carry no policy (there is no page to protect)", () => {
    assert.equal(csp(call("/issues")), "");
  });
});
