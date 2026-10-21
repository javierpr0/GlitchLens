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

if (import.meta.url === `file://${process.argv[1]}`) {
  await start(4101, { token: "tokA-secret-111", orgName: "Acme Alpha" });
  await start(4102, { token: "tokB-secret-222", orgName: "Beta Org" });
  await start(4103, { prefix: "tokC-", orgName: "Gamma Personal" });
  console.log("mock GlitchTip instances listening on 4101, 4102, 4103");
}
