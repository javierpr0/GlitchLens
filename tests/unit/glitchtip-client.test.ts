import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { SESSION_COOKIE, createSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  GlitchTipError,
  InstanceAuthError,
  InstanceUnreachableError,
  glitchtipFetch,
  glitchtipFetchPaginated,
  parseLinkCursor,
} from "@/lib/glitchtip/client";
import { createInstance, NoInstanceError, setUserToken } from "@/lib/instances";
import { createUser } from "@/lib/users";
import { z } from "zod";
import { fakeServer, sendJson, setRequest, withTempDataDir, type FakeServer } from "./helpers.ts";

withTempDataDir();

afterEach(() => {
  setRequest(null);
  getDb().exec("DELETE FROM users; DELETE FROM instances");
});

let seq = 0;
/** A signed-in member with one shared-token instance that points at `server`. */
function connect(server: FakeServer, opts: { token?: string; prefix?: string } = {}) {
  const id = createInstance({ name: `i${++seq}`, baseUrl: server.url + (opts.prefix ?? ""), tokenMode: "shared", token: opts.token ?? "the-instance-token" });
  const uid = createUser({ email: `u${seq}@x.com`, name: "U", role: "member", passwordHash: "h", instanceIds: [id] });
  setRequest({ cookies: { [SESSION_COOKIE]: createSession(uid).token } });
  return { id, uid };
}

describe("parseLinkCursor", () => {
  const realistic =
    '<http://gt/api/0/organizations/a/issues/?limit=25>; rel="previous"; results="false", ' +
    '<http://gt/api/0/organizations/a/issues/?cursor=abc&limit=25>; rel="next"; results="true"; cursor="abc"';

  test("reads the next and previous cursors from GlitchTip's header", () => {
    assert.equal(parseLinkCursor(realistic, "next"), "abc");
    assert.equal(parseLinkCursor(realistic, "previous"), null, "results=false means there is none");
  });

  test("copes with the Python set literal that GlitchTip 6.2.6 wraps the header in", () => {
    assert.equal(parseLinkCursor(`{'${realistic}'}`, "next"), "abc");
    assert.equal(parseLinkCursor(`{'${realistic}'}`, "previous"), null);
  });

  test("returns null when the page is the last one", () => {
    const last = '<http://gt/?limit=25>; rel="next"; results="false"; cursor="zzz"';
    assert.equal(parseLinkCursor(last, "next"), null);
  });

  test("falls back to the cursor query parameter of the URL", () => {
    const link = '<http://gt/x/?cursor=from-url&limit=25>; rel="next"; results="true"';
    assert.equal(parseLinkCursor(link, "next"), "from-url");
  });

  test("returns null for an empty, missing or malformed header", () => {
    for (const bad of ["", "garbage", "<>; rel", 'rel="next"', '<not a url>; rel="next"; results="true"']) {
      assert.equal(parseLinkCursor(bad, "next"), null, JSON.stringify(bad));
    }
  });

  test("ignores segments for the other relation", () => {
    const link = '<http://gt/?cursor=p>; rel="previous"; results="true"; cursor="p"';
    assert.equal(parseLinkCursor(link, "next"), null);
    assert.equal(parseLinkCursor(link, "previous"), "p");
  });
});

describe("glitchtipFetch", () => {
  test("calls the instance with its token and returns the parsed JSON", async () => {
    const srv = await fakeServer((_req, res) => sendJson(res, 200, { hello: "world" }));
    connect(srv, { token: "tok-123" });
    assert.deepEqual(await glitchtipFetch("/api/0/organizations/"), { hello: "world" });
    const r = srv.requests[0];
    assert.equal(r.method, "GET");
    assert.equal(r.path, "/api/0/organizations/");
    assert.equal(r.headers.authorization, "Bearer tok-123");
    assert.equal(r.headers.accept, "application/json");
  });

  test("keeps a path prefix configured on the instance", async () => {
    const srv = await fakeServer((_req, res) => sendJson(res, 200, {}));
    connect(srv, { prefix: "/glitchtip" });
    await glitchtipFetch("/api/0/organizations/");
    assert.equal(srv.requests[0].path, "/glitchtip/api/0/organizations/");
  });

  test("builds the query string: arrays repeat, empty values are skipped", async () => {
    const srv = await fakeServer((_req, res) => sendJson(res, 200, {}));
    connect(srv);
    await glitchtipFetch("/api/0/x/", {
      searchParams: { id: ["1", "2", "", "3"], query: "is:unresolved", empty: "", none: undefined, nothing: null, n: 5, zero: 0 },
    });
    const url = new URL(srv.requests[0].path, "http://x");
    assert.deepEqual(url.searchParams.getAll("id"), ["1", "2", "3"]);
    assert.equal(url.searchParams.get("query"), "is:unresolved");
    assert.equal(url.searchParams.get("n"), "5");
    assert.equal(url.searchParams.get("zero"), "0");
    for (const k of ["empty", "none", "nothing"]) assert.equal(url.searchParams.has(k), false, k);
  });

  test("sends a JSON body with the right method and content type", async () => {
    const srv = await fakeServer((_req, res) => sendJson(res, 200, {}));
    connect(srv);
    await glitchtipFetch("/api/0/issues/5/", { method: "PUT", body: { status: "resolved" } });
    const r = srv.requests[0];
    assert.equal(r.method, "PUT");
    assert.equal(r.headers["content-type"], "application/json");
    assert.deepEqual(JSON.parse(r.body), { status: "resolved" });
  });

  test("204 and non-JSON answers give undefined", async () => {
    const srv = await fakeServer((req, res) => {
      if (req.url === "/204") { res.writeHead(204); return res.end(); }
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("hello");
    });
    connect(srv);
    assert.equal(await glitchtipFetch("/204", { method: "DELETE" }), undefined);
    assert.equal(await glitchtipFetch("/plain"), undefined);
  });

  test("a 401 means the instance token is bad, and is its own error type", async () => {
    const srv = await fakeServer((_req, res) => sendJson(res, 401, { detail: "Invalid token" }));
    connect(srv);
    await assert.rejects(glitchtipFetch("/x"), (e: Error) => e instanceof InstanceAuthError && e.status === 401 && e.name === "InstanceAuthError");
  });

  test("other statuses keep their code and decoded detail", async () => {
    const srv = await fakeServer((req, res) => {
      if (req.url === "/403") return sendJson(res, 403, { detail: "Permission denied" });
      if (req.url === "/404") return sendJson(res, 404, { detail: "Not Found" });
      if (req.url === "/html") { res.writeHead(500, { "content-type": "text/html" }); return res.end("<h1>Server Error (500)</h1>"); }
      sendJson(res, 200, {});
    });
    connect(srv);
    await assert.rejects(glitchtipFetch("/403"), (e: GlitchTipError) => e.status === 403 && !(e instanceof InstanceAuthError) && (e.detail as { detail: string }).detail === "Permission denied");
    await assert.rejects(glitchtipFetch("/404"), (e: GlitchTipError) => e.status === 404);
    await assert.rejects(glitchtipFetch("/html"), (e: GlitchTipError) => e.status === 500 && typeof e.detail === "string" && e.detail.includes("Server Error"));
  });

  test("never follows a redirect: it reports it", async () => {
    const target = await fakeServer((_req, res) => sendJson(res, 200, { stolen: true }));
    const srv = await fakeServer((_req, res) => { res.writeHead(302, { location: target.url + "/api/0/x/" }); res.end(); });
    connect(srv);
    await assert.rejects(glitchtipFetch("/api/0/x/"), (e: Error) => e instanceof InstanceUnreachableError && /redirected/.test(e.message));
    assert.equal(target.requests.length, 0, "the token was never sent to the redirect target");
  });

  test("a dead address is 'unreachable', not a crash", async () => {
    const srv = await fakeServer((_req, res) => sendJson(res, 200, {}));
    const { id } = connect(srv);
    getDb().prepare("UPDATE instances SET base_url = 'http://127.0.0.1:1' WHERE id = ?").run(id);
    await assert.rejects(glitchtipFetch("/x"), (e: Error) => e instanceof InstanceUnreachableError && e.status === 502 && /Could not reach/.test(e.message));
  });

  test("a response that does not match the schema is still returned, with a warning", async () => {
    const srv = await fakeServer((_req, res) => sendJson(res, 200, { id: 5 }));
    connect(srv);
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...a: unknown[]) => void warnings.push(a.map(String).join(" "));
    try {
      assert.deepEqual(await glitchtipFetch("/x", { schema: z.object({ id: z.string() }) }), { id: 5 });
    } finally {
      console.warn = original;
    }
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /shape mismatch/);
  });

  test("refuses to run with no signed-in user", async () => {
    await assert.rejects(glitchtipFetch("/x"), (e: NoInstanceError) => e.reason === "unauthenticated");
  });

  test("a per-user instance is called with that person's own token", async () => {
    const srv = await fakeServer((_req, res) => sendJson(res, 200, {}));
    const iid = createInstance({ name: "pu", baseUrl: srv.url, tokenMode: "per_user" });
    const uid = createUser({ email: "pu@x.com", name: "U", role: "member", passwordHash: "h", instanceIds: [iid] });
    setUserToken(uid, iid, "personal-token");
    setRequest({ cookies: { [SESSION_COOKIE]: createSession(uid).token } });
    await glitchtipFetch("/x");
    assert.equal(srv.requests[0].headers.authorization, "Bearer personal-token");
  });

  test("no instance at all is reported as such", async () => {
    const uid = createUser({ email: "none@x.com", name: "U", role: "member", passwordHash: "h" });
    setRequest({ cookies: { [SESSION_COOKIE]: createSession(uid).token } });
    await assert.rejects(glitchtipFetch("/x"), (e: NoInstanceError) => e.reason === "none");
  });
});

describe("glitchtipFetchPaginated", () => {
  test("returns the page, the cursors and the counters from the headers", async () => {
    const srv = await fakeServer((_req, res) =>
      sendJson(res, 200, [{ id: 1 }, { id: 2 }], {
        "x-hits": "44",
        "x-max-hits": "1000",
        link: `{'<http://gt/?limit=2>; rel="previous"; results="false", <http://gt/?cursor=NEXT&limit=2>; rel="next"; results="true"; cursor="NEXT"'}`,
      }),
    );
    connect(srv);
    const page = await glitchtipFetchPaginated<{ id: number }>("/api/0/issues/", { limit: 2, cursor: "CUR" });
    assert.deepEqual(page, { data: [{ id: 1 }, { id: 2 }], nextCursor: "NEXT", prevCursor: null, total: 44, maxHits: 1000 });
    const url = new URL(srv.requests[0].path, "http://x");
    assert.equal(url.searchParams.get("limit"), "2");
    assert.equal(url.searchParams.get("cursor"), "CUR");
  });

  test("defaults to 25 per page and falls back to the page size when counters are missing", async () => {
    const srv = await fakeServer((_req, res) => sendJson(res, 200, [{ id: 1 }]));
    connect(srv);
    const page = await glitchtipFetchPaginated("/api/0/issues/");
    assert.equal(new URL(srv.requests[0].path, "http://x").searchParams.get("limit"), "25");
    assert.deepEqual([page.total, page.maxHits, page.nextCursor, page.prevCursor], [1, 1, null, null]);
  });

  test("passes errors through the same way", async () => {
    const srv = await fakeServer((_req, res) => sendJson(res, 401, {}));
    connect(srv);
    await assert.rejects(glitchtipFetchPaginated("/x"), InstanceAuthError);
  });

  test("validates each item but never fails the page for it", async () => {
    const srv = await fakeServer((_req, res) => sendJson(res, 200, [{ id: 1 }, { id: "x" }]));
    connect(srv);
    const original = console.warn;
    let warned = 0;
    console.warn = () => void warned++;
    try {
      const page = await glitchtipFetchPaginated("/x", { schema: z.object({ id: z.number() }) });
      assert.equal(page.data.length, 2);
    } finally {
      console.warn = original;
    }
    assert.equal(warned, 1);
  });
});
