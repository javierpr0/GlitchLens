// Minimal fake GlitchTip API used by the e2e suite. Not a faithful implementation.
import http from "node:http";

export function start(port, { token, orgName, prefix }) {
  const state = { revoked: false, log: [] };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/__revoke") { state.revoked = true; res.end("ok"); return; }
    if (url.pathname === "/__log") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(state.log)); return; }
    state.log.push(`${req.method} ${url.pathname} auth=${(req.headers.authorization ?? "").replace("Bearer ", "")}`);
    if (url.pathname === "/api/settings/") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ version: "4.0-mock" })); return; }
    const json = (code, body, headers = {}) => {
      res.writeHead(code, { "content-type": "application/json", ...headers });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };
    const bearer = req.headers.authorization ?? "";
    const valid = prefix ? bearer.startsWith(`Bearer ${prefix}`) : bearer === `Bearer ${token}`;
    if (!valid || state.revoked) return json(401, { detail: "Invalid token" });
    const p = url.pathname;
    if (p === "/api/0/users/me/") return json(200, { id: "1", email: `owner-${port}@example.com`, username: "owner", name: "Owner" });
    if (p === "/api/0/organizations/") return json(200, [{ id: "1", slug: "acme", name: orgName, status: { id: "active", name: "active" }, isAcceptingEvents: true, dateCreated: "2026-01-01T00:00:00Z" }]);
    if (p === "/api/0/organizations/acme/issues/") {
      return json(200, [{ id: "5", shortId: "ACME-5", title: `Boom from ${orgName}`, level: "error", status: "unresolved", count: "3", userCount: 1, numComments: 0, firstSeen: "2026-01-01T00:00:00Z", lastSeen: "2026-01-02T00:00:00Z", project: { id: "1", slug: "web", name: "Web", platform: "javascript" }, stats: { "24h": [] }, metadata: {} }], { "x-hits": "1", "x-max-hits": "1", link: '<http://x/?cursor=a>; rel="previous"; results="false", <http://x/?cursor=b>; rel="next"; results="false"' });
    }
    if (req.method === "DELETE") { res.writeHead(204); return res.end(); }
    if (req.method === "GET") return json(200, p.endsWith("stats_v2/") ? { start: "", end: "", intervals: [], groups: [] } : []);
    return json(200, {});
  });
  return new Promise((r) => server.listen(port, "127.0.0.1", () => r(server)));
}

/**
 * A stateful instance for the bulk-issue tests: cursor pagination, id/status/text filters,
 * PUT/DELETE by id, and an injectable failure. /__state, /__reset and /__fail_after are test hooks.
 */
export function startBulk(port, token) {
  let issues = [];
  let deleteCalls = [];
  let failAfter = null;
  const seed = (alpha, beta, resolvedAlpha) => {
    issues = [];
    deleteCalls = [];
    failAfter = null;
    let id = 1;
    const make = (title, status) => ({
      id: String(id), shortId: `BULK-${id++}`, title, level: "error", status, count: "1", userCount: 0, numComments: 0,
      firstSeen: "2026-01-01T00:00:00Z", lastSeen: "2026-01-02T00:00:00Z",
      project: { id: "1", slug: "web", name: "Web", platform: "javascript" }, stats: { "24h": [] }, metadata: {},
    });
    for (let i = 0; i < alpha; i++) issues.push(make(`Alpha ${i}`, i < resolvedAlpha ? "resolved" : "unresolved"));
    for (let i = 0; i < beta; i++) issues.push(make(`Beta ${i}`, "unresolved"));
  };
  seed(100, 20, 10);

  const matches = (url) => {
    const q = url.searchParams.get("query") ?? "";
    const ids = url.searchParams.getAll("id");
    return issues.filter((x) => {
      if (ids.length && !ids.includes(x.id)) return false;
      for (const term of q.split(/\s+/).filter(Boolean)) {
        if (term === "is:unresolved") { if (x.status !== "unresolved") return false; }
        else if (!x.title.includes(term)) return false;
      }
      return true;
    });
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const json = (code, body, headers = {}) => {
      res.writeHead(code, { "content-type": "application/json", ...headers });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };
    if (url.pathname === "/__state") return json(200, { count: issues.length, resolved: issues.filter((x) => x.status === "resolved").length, deleteCalls });
    if (url.pathname === "/__reset") { seed(Number(url.searchParams.get("alpha") ?? 100), Number(url.searchParams.get("beta") ?? 20), Number(url.searchParams.get("resolved") ?? 10)); return json(200, { ok: true }); }
    if (url.pathname === "/__fail_after") { failAfter = Number(url.searchParams.get("n")); return json(200, { ok: true }); }
    if (url.pathname === "/api/settings/") return json(200, { version: "4.0-mock" });
    if (req.headers.authorization !== `Bearer ${token}`) return json(401, { detail: "Invalid token" });
    const p = url.pathname;
    if (p === "/api/0/users/me/") return json(200, { id: "1", email: "owner-bulk@example.com", username: "owner", name: "Owner" });
    if (p === "/api/0/organizations/") return json(200, [{ id: "1", slug: "acme", name: "Bulk Org", status: { id: "active", name: "active" }, isAcceptingEvents: true, dateCreated: "2026-01-01T00:00:00Z" }]);
    if (p === "/api/0/organizations/acme/issues/") {
      if (req.method === "GET") {
        const all = matches(url);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 25), 100);
        const offset = url.searchParams.get("cursor") ? Number(Buffer.from(url.searchParams.get("cursor"), "base64").toString()) : 0;
        const slice = all.slice(offset, offset + limit);
        const more = offset + limit < all.length;
        const next = Buffer.from(String(offset + limit)).toString("base64");
        return json(200, slice, { "x-hits": String(all.length), "x-max-hits": "1000", link: `<http://x/?cursor=a>; rel="previous"; results="false", <http://x/?cursor=${next}>; rel="next"; results="${more}"; cursor="${next}"` });
      }
      let raw = ""; req.on("data", (c) => (raw += c));
      return req.on("end", () => {
        const ids = url.searchParams.getAll("id");
        if (!ids.length) return json(400, { detail: "id required" });
        if (req.method === "DELETE") {
          if (failAfter !== null && deleteCalls.length >= failAfter) return json(500, { detail: "boom" });
          deleteCalls.push(ids.length);
          issues = issues.filter((x) => !ids.includes(x.id));
          return json(200, {});
        }
        if (req.method === "PUT") {
          const body = raw ? JSON.parse(raw) : {};
          for (const x of issues) if (ids.includes(x.id) && body.status) x.status = body.status;
          return json(200, { status: body.status });
        }
        return json(405, {});
      });
    }
    return json(200, req.method === "GET" ? [] : {});
  });
  return new Promise((r) => server.listen(port, "127.0.0.1", () => r(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await start(4101, { token: "tokA-secret-111", orgName: "Acme Alpha" });
  await start(4102, { token: "tokB-secret-222", orgName: "Beta Org" });
  await start(4103, { prefix: "tokC-", orgName: "Gamma Personal" });
  await startBulk(4104, "tokD-bulk-444");
  console.log("mock GlitchTip instances listening on 4101, 4102, 4103, 4104");
}
