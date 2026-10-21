import { readFileSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const DATA = process.env.DATA;
const CODE = process.env.SETUP_CODE;
let pass = 0, fail = 0;
const ok = (cond, name, extra = "") => { if (cond) pass++; else fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  -> " + extra}`); };

class Client {
  constructor() { this.jar = {}; }
  async req(path, { method = "GET", body, headers = {}, redirect = "manual" } = {}) {
    const h = { ...headers };
    const cookie = Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie) h.cookie = cookie;
    if (body !== undefined) h["content-type"] = "application/json";
    if (method !== "GET" && !("origin" in h)) h.origin = BASE;
    const res = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";"); const i = pair.indexOf("=");
      const k = pair.slice(0, i), v = pair.slice(i + 1);
      if (v === "") delete this.jar[k]; else this.jar[k] = v;
    }
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch {}
    return { status: res.status, text, json, headers: res.headers };
  }
}
const mockLog = async (port) => (await (await fetch(`http://127.0.0.1:${port}/__log`)).json());
const dbText = () => readFileSync(`${DATA}/glitchlens.db`).toString("latin1") + (() => { try { return readFileSync(`${DATA}/glitchlens.db-wal`).toString("latin1"); } catch { return ""; } })();

// 1. unauthenticated
const anon = new Client();
let r = await anon.req("/");
ok(r.status === 307 && r.headers.get("location")?.includes("/login"), "anon / redirects to /login", `${r.status}`);
r = await anon.req("/api/org", { method: "POST", body: { slug: "x" } });
ok(r.status === 401, "anon API call is 401", `${r.status}`);
r = await anon.req("/login");
ok(/\/setup/.test(r.text) && !/Sign in<\/h2>/.test(r.text), "login redirects to /setup when no users", `${r.status}`);

// 2. setup
r = await anon.req("/api/setup", { method: "POST", body: { code: "wrong", name: "Root", email: "root@example.com", password: "supersecret123" } });
ok(r.status === 403, "setup rejects wrong code", `${r.status}`);
r = await anon.req("/api/setup", { method: "POST", body: { code: CODE, name: "Root", email: "root@example.com", password: "short" } });
ok(r.status === 400, "setup rejects short password", `${r.status}`);
r = await anon.req("/api/setup", { method: "POST", headers: { origin: "https://evil.example" }, body: { code: CODE, name: "Root", email: "root@example.com", password: "supersecret123" } });
ok(r.status === 403, "setup rejects cross-origin", `${r.status}`);
const admin = new Client();
r = await admin.req("/api/setup", { method: "POST", body: { code: CODE, name: "Root", email: "root@example.com", password: "supersecret123" } });
ok(r.status === 200 && admin.jar.glitchlens_session, "setup creates superadmin and signs in", `${r.status} ${r.text}`);
const sc = r.headers.getSetCookie().join(";");
ok(/HttpOnly/i.test(sc) && /SameSite=lax/i.test(sc), "session cookie is HttpOnly + SameSite=Lax", sc);
r = await new Client().req("/api/setup", { method: "POST", body: { code: CODE, name: "Evil", email: "evil@example.com", password: "supersecret123" } });
ok(r.status === 404, "second setup is rejected (404)", `${r.status}`);
r = await new Client().req("/setup");
ok(/NEXT_REDIRECT/.test(r.text) && !/Create the superadmin<\/h1>/.test(r.text), "/setup redirects once configured", `${r.status}`);

// 3. login throttle
const t = new Client();
let last;
for (let i = 0; i < 6; i++) last = await t.req("/api/auth/login", { method: "POST", body: { email: "ghost@example.com", password: "nopenopenope" } });
ok(last.status === 429 && last.headers.get("retry-after"), "login locks after repeated failures (429 + Retry-After)", `${last.status}`);
r = await new Client().req("/api/auth/login", { method: "POST", body: { email: "root@example.com", password: "wrong-password" } });
ok(r.status === 401, "wrong password is 401", `${r.status}`);
const flood = new Client();
for (let i = 0; i < 40; i++) await flood.req("/api/auth/login", { method: "POST", body: { email: `ghost${i}@example.com`, password: "nopenopenope" } });
r = await new Client().req("/api/auth/login", { method: "POST", body: { email: "root@example.com", password: "supersecret123" } });
ok(r.status === 200, "fake-email flood does not lock out real users", `${r.status}`);
const spoof = new Client();
for (let i = 0; i < 30; i++) await spoof.req("/api/auth/login", { method: "POST", headers: { "x-forwarded-for": `9.9.9.${i}` }, body: { email: "ghost@spoof.example", password: "nopenopenope" } });
r = await spoof.req("/api/auth/login", { method: "POST", headers: { "x-forwarded-for": "1.2.3.4" }, body: { email: "ghost@spoof.example", password: "x" } });
ok(r.status === 429, "per-account lock holds even when X-Forwarded-For rotates", `${r.status}`);

// 3c. a real account stays locked even after a flood of fake emails (counters for real accounts are never evicted)
await admin.req("/api/admin/users", { method: "POST", body: { name: "Lock", email: "lock@example.com", password: "lockpassword123", role: "viewer" } });
for (let i = 0; i < 5; i++) await new Client().req("/api/auth/login", { method: "POST", body: { email: "lock@example.com", password: "wrong-wrong-wrong" } });
for (let i = 0; i < 60; i++) await flood.req("/api/auth/login", { method: "POST", body: { email: `fill${i}@example.com`, password: "nopenopenope" } });
r = await new Client().req("/api/auth/login", { method: "POST", body: { email: "lock@example.com", password: "lockpassword123" } });
ok(r.status === 429, "real account lock survives a flood of fake emails (even with the right password)", `${r.status}`);

// 3d. a burst of logins cannot saturate password hashing, and the server recovers
const burst = await Promise.all(Array.from({ length: 60 }, (_, i) => new Client().req("/api/auth/login", { method: "POST", body: { email: `burst${i}@example.com`, password: "nopenopenope" } })));
ok(burst.some((x) => x.status === 503 && x.headers.get("retry-after")), "login burst is shed with 503 + Retry-After", JSON.stringify([...new Set(burst.map((x) => x.status))]));
ok(burst.every((x) => x.status === 401 || x.status === 503 || x.status === 429), "burst only yields 401/503/429");
r = await new Client().req("/api/auth/login", { method: "POST", body: { email: "root@example.com", password: "supersecret123" } });
ok(r.status === 200, "login works right after the burst", `${r.status}`);
r = await new Client().req("/api/health");
ok(r.status === 200 && r.json?.status === "ok" && Object.keys(r.json).length === 1, "health endpoint is public and minimal", r.text);

// 4. instances (superadmin)
r = await admin.req("/settings/instances");
ok(r.status === 200, "superadmin sees /settings/instances", `${r.status}`);
r = await admin.req("/");
ok(r.status === 200 && /No GlitchTip instance connected/.test(r.text), "dashboard with zero instances shows empty state", `${r.status}`);
r = await admin.req("/api/admin/instances", { method: "POST", body: { name: "A", baseUrl: "http://127.0.0.1:4101", token: "bad-token" } });
ok(r.status === 400 && /rejected the token/.test(r.json?.error ?? ""), "rejects instance with bad token", `${r.status} ${r.text}`);
r = await admin.req("/api/admin/instances", { method: "POST", body: { name: "A", baseUrl: "ftp://x", token: "t" } });
ok(r.status === 400, "rejects non-http URL", `${r.status}`);
r = await admin.req("/api/admin/instances/test", { method: "POST", body: { baseUrl: "http://127.0.0.1:4101/", token: "tokA-secret-111" } });
ok(r.json?.ok === true && r.json?.organizations === 1, "test connection ok", r.text);
r = await admin.req("/api/admin/instances", { method: "POST", body: { name: "Alpha", baseUrl: "http://127.0.0.1:4101/", token: "tokA-secret-111" } });
ok(r.status === 201, "creates instance A", r.text);
const idA = r.json?.id;
r = await admin.req("/api/admin/instances", { method: "POST", body: { name: "Beta", baseUrl: "http://127.0.0.1:4102", token: "tokB-secret-222" } });
ok(r.status === 201, "creates instance B", r.text);
const idB = r.json?.id;
r = await admin.req("/api/admin/instances", { method: "POST", body: { name: "Dup", baseUrl: "http://127.0.0.1:4102", token: "tokB-secret-222" } });
ok(r.status === 409, "duplicate URL rejected", `${r.status}`);

// 5. switching
r = await admin.req("/issues");
ok(r.status === 200 && /Boom from Acme Alpha/.test(r.text), "issues show instance A data by default", `${r.status}`);
r = await admin.req("/api/instance", { method: "POST", body: { id: idB } });
ok(r.status === 200, "switch to instance B", `${r.status}`);
r = await admin.req("/issues");
ok(/Boom from Beta Org/.test(r.text) && !/Boom from Acme Alpha/.test(r.text), "issues now show instance B only", "");

// 6. users + isolation
r = await admin.req("/api/admin/users", { method: "POST", body: { name: "Mia", email: "mia@example.com", password: "memberpass123", role: "member", instanceIds: [idA] } });
ok(r.status === 201, "creates member", r.text);
const miaId = r.json?.id;
r = await admin.req("/api/admin/users", { method: "POST", body: { name: "Vic", email: "vic@example.com", password: "viewerpass123", role: "viewer", instanceIds: [idA] } });
ok(r.status === 201, "creates viewer", r.text);
r = await admin.req("/api/admin/users", { method: "POST", body: { name: "Mia2", email: "MIA@example.com", password: "memberpass123", role: "member" } });
ok(r.status === 409, "email uniqueness is case-insensitive", `${r.status}`);

const mia = new Client();
r = await mia.req("/api/auth/login", { method: "POST", body: { email: "mia@example.com", password: "memberpass123" } });
ok(r.status === 200, "member can sign in", `${r.status}`);
r = await mia.req("/api/instance", { method: "POST", body: { id: idB } });
ok(r.status === 403, "member cannot switch to unassigned instance", `${r.status}`);
mia.jar.gl_instance = String(idB);
r = await mia.req("/issues");
ok(/Boom from Acme Alpha/.test(r.text) && !/Boom from Beta Org/.test(r.text), "forged instance cookie falls back to allowed instance", "");
r = await mia.req("/settings/users");
ok(!/Add user/.test(r.text) && /Lost in the stack/.test(r.text), "member sees not-found on /settings/users", `${r.status}`);
r = await mia.req("/settings/instances");
ok(!/Add instance/.test(r.text) && /Lost in the stack/.test(r.text), "member sees not-found on /settings/instances", `${r.status}`);
r = await mia.req("/api/admin/users", { method: "POST", body: { name: "x", email: "x@example.com", password: "xxxxxxxxxxxx", role: "superadmin" } });
ok(r.status === 403, "member cannot create users", `${r.status}`);
r = await mia.req("/api/admin/instances/test", { method: "POST", body: { baseUrl: "http://127.0.0.1:4101", token: "t" } });
ok(r.status === 403, "member cannot use instance test (SSRF surface)", `${r.status}`);

// 7. proxy permissions and traversal
const before = (await mockLog(4101)).length;
r = await mia.req("/api/glitchtip/organizations/acme/members/1", { method: "DELETE" });
ok(r.status === 403, "member cannot remove org members via proxy (shared mode)", `${r.status}`);
r = await mia.req("/api/glitchtip/projects/acme/web", { method: "DELETE" });
ok(r.status === 403, "member cannot delete projects via proxy (shared mode)", `${r.status}`);
r = await mia.req("/api/glitchtip/issues/5", { method: "PUT", body: { status: "resolved" } });
ok(r.status === 200, "member can update an issue via proxy", `${r.status} ${r.text}`);
r = await mia.req("/api/glitchtip/issues/5", { method: "PUT", body: { status: "resolved" }, headers: { origin: "https://evil.example" } });
ok(r.status === 403, "cross-origin mutation blocked", `${r.status}`);
for (const p of ["/api/glitchtip/%2e%2e/%2e%2e/x", "/api/glitchtip/..%2f..%2fadmin", "/api/glitchtip/a%5Cb"]) {
  r = await mia.req(p);
  ok(r.status === 400 || r.status === 404, `traversal blocked: ${p}`, `${r.status}`);
}
r = await mia.req("/api/glitchtip/issues/abc", { method: "PUT", body: { status: "resolved" } });
ok(r.status === 400 || r.status === 404, "issue id must be numeric", `${r.status}`);
const log = await mockLog(4101);
ok(log.slice(before).every((l) => l.includes("/api/0/")), "mock only saw /api/0/ paths", JSON.stringify(log.slice(before)));
ok(!log.slice(before).some((l) => l.startsWith("DELETE")), "no DELETE reached GlitchTip", JSON.stringify(log.slice(before)));

const vic = new Client();
await vic.req("/api/auth/login", { method: "POST", body: { email: "vic@example.com", password: "viewerpass123" } });
r = await vic.req("/api/glitchtip/issues/5", { method: "PUT", body: { status: "resolved" } });
ok(r.status === 403, "viewer cannot update issues (issues route)", `${r.status}`);
r = await vic.req("/api/glitchtip/organizations/acme/teams", { method: "POST", body: { slug: "t" } });
ok(r.status === 403, "viewer cannot POST via proxy", `${r.status}`);
r = await vic.req("/api/glitchtip/organizations/acme/issues");
ok(r.status === 200, "viewer can read via proxy", `${r.status}`);

// 7b. the token owner's own account is off limits through a shared token
for (const [who, c] of [["member", mia], ["viewer", vic]]) {
  for (const p of ["/api/glitchtip/users/me", "/api/glitchtip/api-tokens"]) {
    r = await c.req(p);
    ok(r.status === 403, `${who} cannot even read ${p} via a shared token`, `${r.status}`);
  }
}
r = await admin.req("/api/glitchtip/users/me");
ok(r.status === 200, "superadmin can read users/me via proxy", `${r.status}`);

// 8. superadmin safety
r = await admin.req("/api/admin/users/1", { method: "PATCH", body: { role: "member" } });
ok(r.status === 400, "superadmin cannot demote self", `${r.status} ${r.text}`);
r = await admin.req("/api/admin/users/1", { method: "DELETE" });
ok(r.status === 400, "superadmin cannot delete self", `${r.status}`);
r = await mia.req("/api/admin/users/1", { method: "DELETE" });
ok(r.status === 403, "member cannot delete users", `${r.status}`);

// 9. revoked token must not log anyone out
await fetch("http://127.0.0.1:4101/__revoke");
r = await mia.req("/issues");
ok(r.status === 200 && /rejected the instance token/.test(r.text), "revoked instance token shows problem panel", `${r.status}`);
r = await mia.req("/settings/account");
ok(r.status === 200, "session survives a revoked instance token", `${r.status}`);

// 10. password change / deactivate
const mia2 = new Client();
await mia2.req("/api/auth/login", { method: "POST", body: { email: "mia@example.com", password: "memberpass123" } });
r = await mia.req("/api/account/password", { method: "POST", body: { current: "memberpass123", next: "newmemberpass456" } });
ok(r.status === 200, "member changes own password", r.text);
r = await mia2.req("/api/account", { method: "PATCH", body: { name: "Mia B" } });
ok(r.status === 401, "other session is signed out after password change", `${r.status}`);
r = await mia.req("/api/account", { method: "PATCH", body: { name: "Mia B" } });
ok(r.status === 200, "current session survives password change", `${r.status}`);
r = await admin.req(`/api/admin/users/${miaId}`, { method: "PATCH", body: { active: false } });
ok(r.status === 200, "admin disables member", r.text);
r = await mia.req("/api/account", { method: "PATCH", body: { name: "Mia C" } });
ok(r.status === 401, "disabled user session stops working immediately", `${r.status}`);
r = await new Client().req("/api/auth/login", { method: "POST", body: { email: "mia@example.com", password: "newmemberpass456" } });
ok(r.status === 401, "disabled user cannot sign in", `${r.status}`);

// 11. logout
await admin.req("/api/auth/logout", { method: "POST" });
const stale = new Client(); stale.jar.glitchlens_session = "forged-or-old-token";
r = await stale.req("/api/account", { method: "PATCH", body: { name: "x" } });
ok(r.status === 401, "forged session cookie is rejected", `${r.status}`);

// 12. secrets at rest
const d1 = dbText();
ok(!d1.includes("tokA-secret-111") && !d1.includes("tokB-secret-222"), "instance tokens are not stored in plaintext");
ok(!d1.includes("supersecret123"), "passwords are not stored in plaintext");
ok((statSync(`${DATA}/secret.key`).mode & 0o777) === 0o600, "secret.key is mode 600");
const admin2 = new Client();
await admin2.req("/api/auth/login", { method: "POST", body: { email: "root@example.com", password: "supersecret123" } });
let leaked = false;
for (const p of ["/", "/settings/instances", "/settings/users", "/issues"]) {
  const x = await admin2.req(p);
  if (/tokA-secret|tokB-secret/.test(x.text)) leaked = true;
}
ok(!leaked, "instance tokens never appear in rendered pages");
r = await admin2.req("/");
ok(r.headers.get("x-frame-options") === "DENY" && r.headers.get("x-content-type-options") === "nosniff", "security headers present");

// 13. per-user token instance
r = await admin2.req("/api/admin/instances", { method: "POST", body: { name: "Gamma", baseUrl: "http://127.0.0.1:4103", tokenMode: "per_user" } });
ok(r.status === 201, "creates per-user instance without a shared token", r.text);
const idC = r.json?.id;
r = await admin2.req("/api/admin/instances", { method: "POST", body: { name: "Bad", baseUrl: "http://127.0.0.1:4999", tokenMode: "per_user" } });
ok(r.status === 400, "per-user instance still validates that the URL is GlitchTip", `${r.status}`);
r = await admin2.req("/api/admin/instances", { method: "POST", body: { name: "NoTok", baseUrl: "http://127.0.0.1:4101/x", tokenMode: "shared" } });
ok(r.status === 400, "shared instance requires a token", `${r.status}`);
await admin2.req("/api/admin/users", { method: "POST", body: { name: "Neo", email: "neo@example.com", password: "neopassword123", role: "member", instanceIds: [idC] } });
await admin2.req("/api/admin/users", { method: "POST", body: { name: "Wes", email: "wes@example.com", password: "wespassword123", role: "viewer", instanceIds: [idC] } });
const neo = new Client();
await neo.req("/api/auth/login", { method: "POST", body: { email: "neo@example.com", password: "neopassword123" } });
r = await neo.req("/issues");
ok(/Add your GlitchTip token/.test(r.text) && !/Boom from/.test(r.text), "user without personal token is asked to add one", `${r.status}`);
r = await neo.req("/api/account/tokens", { method: "POST", body: { instanceId: idC, token: "nope" } });
ok(r.status === 400, "invalid personal token is rejected", `${r.status} ${r.text}`);
r = await neo.req("/api/account/tokens", { method: "POST", body: { instanceId: idA, token: "tokA-secret-111" } });
ok(r.status === 404, "cannot set a personal token on a shared or unassigned instance", `${r.status}`);
r = await neo.req("/api/account/tokens", { method: "POST", body: { instanceId: idC, token: "tokC-neo" } });
ok(r.status === 200, "valid personal token is saved", r.text);
r = await neo.req("/issues");
ok(/Boom from Gamma Personal/.test(r.text), "user sees data with own token", `${r.status}`);
r = await neo.req("/api/glitchtip/issues/5", { method: "PUT", body: { status: "resolved" } });
ok(r.status === 200, "issue update works with own token", `${r.status}`);
r = await neo.req("/api/glitchtip/projects/acme/web", { method: "DELETE" });
ok(r.status === 204, "per-user mode defers org-level permissions to GlitchTip (member not blocked locally)", `${r.status}`);
const wes = new Client();
await wes.req("/api/auth/login", { method: "POST", body: { email: "wes@example.com", password: "wespassword123" } });
await wes.req("/api/account/tokens", { method: "POST", body: { instanceId: idC, token: "tokC-wes" } });
r = await wes.req("/api/glitchtip/issues/5", { method: "PUT", body: { status: "resolved" } });
ok(r.status === 403, "viewer stays read-only in per-user mode", `${r.status}`);
const logC = await mockLog(4103);
ok(logC.some((l) => l.startsWith("PUT") && l.includes("/issues/5/") && l.includes("auth=tokC-neo")), "GlitchTip saw the user's own token on the mutation", JSON.stringify(logC.slice(-6)));
ok(!logC.some((l) => l.startsWith("PUT") && l.includes("auth=tokC-wes")), "viewer's token was never used for a write");
const d2 = dbText();
ok(!d2.includes("tokC-neo") && !d2.includes("tokC-wes"), "personal tokens are encrypted at rest");
r = await neo.req("/settings/account");
ok(/Your GlitchTip tokens/.test(r.text) && !/tokC-neo/.test(r.text), "account page lists personal tokens without exposing them");
r = await neo.req("/api/account/tokens", { method: "DELETE", body: { instanceId: idC } });
ok(r.status === 204, "personal token can be removed", `${r.status}`);
r = await neo.req("/issues");
ok(/Add your GlitchTip token/.test(r.text), "after removal the user is asked again");
await neo.req("/api/account/tokens", { method: "POST", body: { instanceId: idC, token: "tokC-neo" } });
r = await neo.req("/api/glitchtip/users/me");
ok(r.status === 200, "per-user mode: own account readable (GlitchTip enforces)", `${r.status}`);
r = await admin2.req("/api/admin/instances/test", { method: "POST", body: { instanceId: idA, baseUrl: "http://127.0.0.1:4102" } });
ok(r.status === 400, "test endpoint will not replay a stored token against a different URL", `${r.status} ${r.text}`);
r = await admin2.req("/api/admin/instances/test", { method: "POST", body: { instanceId: idB } });
ok(r.status === 200 && r.json?.ok === true, "test endpoint still works with the stored token and URL", `${r.status} ${r.text}`);
r = await admin2.req(`/api/admin/instances/${idB}`, { method: "PATCH", body: { baseUrl: "http://127.0.0.1:4101" } });
ok(r.status === 400, "changing a shared instance URL requires entering the token again", `${r.status} ${r.text}`);
const logBefore = (await mockLog(4101)).length;
await admin2.req(`/api/admin/instances/${idB}`, { method: "PATCH", body: { baseUrl: "http://127.0.0.1:4101/" } });
ok((await mockLog(4101)).length === logBefore, "the stored token was never sent to the new URL");
r = await admin2.req(`/api/admin/instances/${idC}`, { method: "PATCH", body: { baseUrl: "http://localhost:4103" } });
ok(r.status === 200, "per-user instance URL can change", `${r.status} ${r.text}`);
r = await neo.req("/issues");
ok(/Add your GlitchTip token/.test(r.text), "personal tokens are wiped when the instance URL changes", `${r.status}`);
r = await admin2.req(`/api/admin/instances/${idC}`, { method: "PATCH", body: { tokenMode: "shared" } });
ok(r.status === 400, "switching to shared requires a shared token", `${r.status} ${r.text}`);
r = await admin2.req(`/api/admin/instances/${idC}`, { method: "PATCH", body: { tokenMode: "shared", token: "tokC-shared" } });
ok(r.status === 200, "can switch per-user to shared with a token", r.text);
r = await neo.req("/api/account/tokens", { method: "POST", body: { instanceId: idC, token: "tokC-x" } });
ok(r.status === 404, "personal tokens no longer accepted once instance is shared", `${r.status}`);
r = await neo.req("/api/glitchtip/projects/acme/web", { method: "DELETE" });
ok(r.status === 403, "after switching to shared, local role limits apply again", `${r.status}`);


// 14. audit log
r = await admin2.req("/settings/audit");
ok(["setup.complete", "user.create", "instance.create", "instance.update", "user.update", "login.locked", "account.password_change", "token.set"].every((a) => r.text.includes(a)), "audit log records setup, user, instance, token and lockout events", `${r.status}`);
ok(!/ghost@example\.com|ghost\d+@example\.com|burst\d+@/.test(r.text), "audit log does not record failures for made-up emails");
ok(!/tokA-secret|tokB-secret|tokC-neo|supersecret123|memberpass123|newmemberpass456|neopassword123/.test(r.text), "audit log never contains passwords or tokens");
r = await neo.req("/settings/audit");
ok(!/user\.create/.test(r.text) && /Lost in the stack/.test(r.text), "audit log is superadmin only");

// 15. session management
await admin2.req("/api/admin/users", { method: "POST", body: { name: "Sam", email: "sam@example.com", password: "sampassword123", role: "member" } });
const login = async (ua) => { const c = new Client(); await c.req("/api/auth/login", { method: "POST", headers: { "user-agent": ua }, body: { email: "sam@example.com", password: "sampassword123" } }); return c; };
const s1 = await login("TestAgent/1.0 (Mac OS X)"), s2 = await login("TestAgent/2.0"), s3 = await login("TestAgent/3.0");
r = await s1.req("/api/account/sessions");
ok(r.json?.sessions?.length === 3 && r.json.sessions.filter((x) => x.current).length === 1, "lists own sessions and marks the current one", r.text);
ok(r.json?.sessions?.some((x) => x.userAgent === "TestAgent/1.0 (Mac OS X)" && x.current), "session records the user agent");
ok(!r.text.includes("token_hash") && r.json.sessions.every((x) => x.id.length === 12), "session handles are short prefixes, not full hashes");
const other = r.json.sessions.find((x) => !x.current);
const cur = r.json.sessions.find((x) => x.current);
r = await s1.req("/api/account/sessions", { method: "DELETE", body: { id: cur.id } });
ok(r.status === 404, "cannot revoke the current session through the list", `${r.status}`);
r = await s1.req("/api/account/sessions", { method: "DELETE", body: { id: "zz" } });
ok(r.status === 404, "malformed session handle is rejected", `${r.status}`);
const neoList = await neo.req("/api/account/sessions");
r = await s1.req("/api/account/sessions", { method: "DELETE", body: { id: neoList.json.sessions[0].id } });
ok(r.status === 404, "cannot revoke another user's session", `${r.status}`);
r = await s1.req("/api/account/sessions", { method: "DELETE", body: { id: other.id } });
ok(r.status === 204, "revokes one other session", `${r.status}`);
const statuses = [(await s2.req("/api/account", { method: "PATCH", body: { name: "Sam" } })).status, (await s3.req("/api/account", { method: "PATCH", body: { name: "Sam" } })).status].sort();
ok(statuses[0] === 200 && statuses[1] === 401, "exactly the revoked session stopped working", JSON.stringify(statuses));
r = await s1.req("/api/account/sessions", { method: "DELETE", body: { others: true } });
ok(r.status === 200 && r.json?.revoked === 1, "sign out everywhere else", r.text);
r = await s1.req("/api/account", { method: "PATCH", body: { name: "Sam" } });
ok(r.status === 200, "current session survives sign out everywhere else", `${r.status}`);
const rawDb = new DatabaseSync(`${DATA}/glitchlens.db`);
rawDb.prepare("UPDATE sessions SET last_used_at = ? WHERE user_id = (SELECT id FROM users WHERE email = 'sam@example.com')").run(Date.now() - 8 * 24 * 3600 * 1000);
rawDb.close();
r = await s1.req("/api/account", { method: "PATCH", body: { name: "Sam" } });
ok(r.status === 401, "session idle for more than 7 days expires", `${r.status}`);
r = await admin2.req("/settings/audit");
ok(/session\.revoke_others/.test(r.text) && /session\.revoke/.test(r.text), "session revocations are audited");


// 16. two-factor authentication
// An independent TOTP implementation, checked against the RFC 6238 test vector, so the app is not tested against itself.
const b32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const b32dec = (t) => { let bits = 0, v = 0; const out = []; for (const ch of t) { v = (v << 5) | b32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); };
const hotp = (key, step, digits = 6) => { const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(step)); const h = createHmac("sha1", key).update(c).digest(); const o = h[h.length - 1] & 15; return String((h.readUInt32BE(o) & 0x7fffffff) % 10 ** digits).padStart(digits, "0"); };
ok(hotp(Buffer.from("12345678901234567890"), 1, 8) === "94287082", "test TOTP helper matches the RFC 6238 vector");
const stepNow = () => Math.floor(Date.now() / 30000);
const codeFor = (secret, offset = 0) => hotp(b32dec(secret), stepNow() + offset);
const withDb = (fn) => { const d = new DatabaseSync(`${DATA}/glitchlens.db`); try { return fn(d); } finally { d.close(); } };
const clearAttempts = () => withDb((d) => d.exec("DELETE FROM login_attempts"));
const freeStep = () => withDb((d) => d.exec("UPDATE users SET totp_last_step = 0"));

r = await admin2.req("/api/admin/users", { method: "POST", body: { name: "Tia", email: "tia@example.com", password: "tiapassword123", role: "member" } });
const tiaId = r.json?.id;
const tiaLogin = async () => { const c = new Client(); const x = await c.req("/api/auth/login", { method: "POST", body: { email: "tia@example.com", password: "tiapassword123" } }); return { c, x }; };
let { c: t1 } = await tiaLogin();
const { c: t2 } = await tiaLogin();

r = await t1.req("/api/account/2fa/setup", { method: "POST" });
ok(r.status === 200 && /^data:image\/svg\+xml;base64,/.test(r.json?.qr ?? "") && /^[A-Z2-7]{32}$/.test(r.json?.secret ?? ""), "2FA setup returns a QR image and a 160-bit base32 secret", r.text.slice(0, 120));
const secret = r.json.secret;
r = await t1.req("/api/account/2fa/enable", { method: "POST", body: { password: "tiapassword123", code: "000000" } });
ok(r.status === 400, "enabling with a wrong code fails", `${r.status}`);
r = await t1.req("/api/account/2fa/enable", { method: "POST", body: { code: codeFor(secret) } });
ok(r.status === 400, "enabling 2FA without the password is refused", `${r.status}`);
r = await t1.req("/api/account/2fa/enable", { method: "POST", body: { password: "wrong-password", code: codeFor(secret) } });
ok(r.status === 400, "enabling 2FA with a wrong password is refused", `${r.status}`);
r = await t2.req("/api/account", { method: "PATCH", body: { name: "Tia" } });
ok(r.status === 200, "a refused enable does not end other sessions", `${r.status}`);
clearAttempts();
r = await t1.req("/api/account/2fa/enable", { method: "POST", body: { password: "tiapassword123", code: codeFor(secret) } });
const recovery = r.json?.recoveryCodes ?? [];
ok(r.status === 200 && recovery.length === 10 && recovery.every((c) => /^[A-Z2-7]{5}-[A-Z2-7]{5}$/.test(c)), "enabling returns 10 recovery codes", r.text.slice(0, 120));
r = await t2.req("/api/account", { method: "PATCH", body: { name: "Tia" } });
ok(r.status === 401, "enabling 2FA signs out the user's other sessions", `${r.status}`);
r = await t1.req("/api/account", { method: "PATCH", body: { name: "Tia" } });
ok(r.status === 200, "the session that enabled 2FA stays signed in", `${r.status}`);
r = await t1.req("/api/account/2fa/setup", { method: "POST" });
ok(r.status === 409, "cannot restart setup while 2FA is on", `${r.status}`);

// password alone no longer signs in
let { c: pw, x } = await tiaLogin();
ok(x.status === 200 && x.json?.twoFactor === true && x.json?.challenge && !pw.jar.glitchlens_session, "correct password alone returns a challenge and no session", x.text);
r = await pw.req("/api/account", { method: "PATCH", body: { name: "x" } });
ok(r.status === 401, "no access is possible with only the password step");
// the code that confirmed enrolment cannot be reused
r = await pw.req("/api/auth/login/2fa", { method: "POST", body: { challenge: x.json.challenge, code: codeFor(secret) } });
ok(r.status === 401, "the enrolment code cannot be replayed as a login code", `${r.status}`);
clearAttempts();
({ c: pw, x } = await tiaLogin());
const good = codeFor(secret, 1);
r = await pw.req("/api/auth/login/2fa", { method: "POST", body: { challenge: x.json.challenge, code: good } });
ok(r.status === 200 && pw.jar.glitchlens_session, "password plus a valid code signs in", `${r.status} ${r.text}`);
r = await pw.req("/api/account/sessions");
ok(r.status === 200, "the new session works");
// replay of the same code
({ c: pw, x } = await tiaLogin());
r = await pw.req("/api/auth/login/2fa", { method: "POST", body: { challenge: x.json.challenge, code: good } });
ok(r.status === 401, "a code that already worked cannot be used again", `${r.status}`);
clearAttempts(); freeStep();
// a used challenge cannot be reused
({ c: pw, x } = await tiaLogin());
const ch1 = x.json.challenge;
await pw.req("/api/auth/login/2fa", { method: "POST", body: { challenge: ch1, code: codeFor(secret) } });
freeStep();
r = await new Client().req("/api/auth/login/2fa", { method: "POST", body: { challenge: ch1, code: codeFor(secret) } });
ok(r.status === 401, "a consumed challenge cannot be reused", `${r.status}`);
// expired challenge
clearAttempts(); freeStep();
({ c: pw, x } = await tiaLogin());
withDb((d) => d.exec("UPDATE login_challenges SET expires_at = 1"));
r = await pw.req("/api/auth/login/2fa", { method: "POST", body: { challenge: x.json.challenge, code: codeFor(secret) } });
ok(r.status === 401, "an expired challenge is rejected", `${r.status}`);
// per-challenge attempt cap
clearAttempts(); freeStep();
({ c: pw, x } = await tiaLogin());
for (let i = 0; i < 5; i++) await pw.req("/api/auth/login/2fa", { method: "POST", body: { challenge: x.json.challenge, code: "000000" } });
clearAttempts();
r = await pw.req("/api/auth/login/2fa", { method: "POST", body: { challenge: x.json.challenge, code: codeFor(secret) } });
ok(r.status === 401, "a challenge dies after 5 attempts, even for the right code", `${r.status}`);
// account lock across fresh challenges
clearAttempts(); freeStep();
let lockedStatus = 0;
for (let i = 0; i < 7; i++) {
  const { c, x: lx } = await tiaLogin();
  if (!lx.json?.challenge) { lockedStatus = lx.status; break; }
  const rr = await c.req("/api/auth/login/2fa", { method: "POST", body: { challenge: lx.json.challenge, code: "000000" } });
  if (rr.status === 429) { lockedStatus = 429; break; }
}
ok(lockedStatus === 429, "guessing codes across new challenges still hits the account lock", `${lockedStatus}`);
r = (await tiaLogin()).x;
ok(r.status === 429, "even the right password is refused while locked", `${r.status}`);
clearAttempts(); freeStep();
// recovery code works once
({ c: pw, x } = await tiaLogin());
r = await pw.req("/api/auth/login/2fa", { method: "POST", body: { challenge: x.json.challenge, code: recovery[0].toLowerCase() } });
ok(r.status === 200, "a recovery code signs in (case and dash insensitive)", `${r.status} ${r.text}`);
({ c: pw, x } = await tiaLogin());
r = await pw.req("/api/auth/login/2fa", { method: "POST", body: { challenge: x.json.challenge, code: recovery[0] } });
ok(r.status === 401, "a recovery code works only once", `${r.status}`);
clearAttempts();
// account changes between the two steps invalidate the challenge
({ c: pw, x } = await tiaLogin());
await admin2.req(`/api/admin/users/${tiaId}`, { method: "PATCH", body: { password: "tianewpassword456" } });
freeStep();
r = await pw.req("/api/auth/login/2fa", { method: "POST", body: { challenge: x.json.challenge, code: codeFor(secret) } });
ok(r.status === 401, "a password change between the steps invalidates the challenge", `${r.status}`);
await admin2.req(`/api/admin/users/${tiaId}`, { method: "PATCH", body: { password: "tiapassword123" } });
clearAttempts(); freeStep();
// unreadable secret must deny, never skip 2FA
const goodBlob = withDb((d) => d.prepare("SELECT totp_secret_enc AS v FROM users WHERE id = ?").get(tiaId).v);
withDb((d) => d.prepare("UPDATE users SET totp_secret_enc = 'garbage' WHERE id = ?").run(tiaId));
({ c: pw, x } = await tiaLogin());
ok(x.json?.twoFactor === true && !pw.jar.glitchlens_session, "unreadable 2FA secret still requires the second step");
r = await pw.req("/api/auth/login/2fa", { method: "POST", body: { challenge: x.json.challenge, code: codeFor(secret) } });
ok(r.status === 401 && /unavailable/.test(r.json?.error ?? "") && !pw.jar.glitchlens_session, "unreadable 2FA secret denies the login instead of skipping it", `${r.status} ${r.text}`);
withDb((d) => d.prepare("UPDATE users SET totp_secret_enc = ? WHERE id = ?").run(goodBlob, tiaId));
clearAttempts(); freeStep();
// the admin password reset above ended every session, including t1: sign in again through both steps
clearAttempts(); freeStep();
{
  const { c, x: lx } = await tiaLogin();
  await c.req("/api/auth/login/2fa", { method: "POST", body: { challenge: lx.json.challenge, code: codeFor(secret, 1) } });
  t1 = c;
}
clearAttempts(); freeStep();
// sensitive actions need password + code and are throttled
r = await t1.req("/api/account/2fa/recovery", { method: "POST", body: { password: "wrong-password", code: codeFor(secret) } });
ok(r.status === 400, "regenerating codes needs the right password", `${r.status}`);
r = await t1.req("/api/account/2fa/recovery", { method: "POST", body: { password: "tiapassword123", code: "000000" } });
ok(r.status === 400, "regenerating codes needs a valid code", `${r.status}`);
clearAttempts(); freeStep();
r = await t1.req("/api/account/2fa/recovery", { method: "POST", body: { password: "tiapassword123", code: codeFor(secret, 1) } });
const fresh = r.json?.recoveryCodes ?? [];
ok(r.status === 200 && fresh.length === 10 && !fresh.includes(recovery[1]), "new recovery codes replace the old set", r.text.slice(0, 100));
({ c: pw, x } = await tiaLogin());
r = await pw.req("/api/auth/login/2fa", { method: "POST", body: { challenge: x.json.challenge, code: recovery[1] } });
ok(r.status === 401, "old recovery codes stop working after regeneration", `${r.status}`);
clearAttempts();
let lastPw;
for (let i = 0; i < 6; i++) lastPw = await t1.req("/api/account/password", { method: "POST", body: { current: "nope-nope-nope", next: "whatever-password-1" } });
ok(lastPw.status === 429, "password-confirmation endpoints share the account lock", `${lastPw.status}`);
clearAttempts(); freeStep();
// permissions on reset
r = await neo.req(`/api/admin/users/${tiaId}`, { method: "PATCH", body: { resetTwoFactor: true } });
ok(r.status === 403, "a member cannot reset someone else's 2FA", `${r.status}`);
// admin reset
r = await admin2.req("/api/admin/users/1", { method: "PATCH", body: { resetTwoFactor: true } });
ok(r.status === 400, "a superadmin cannot reset their own 2FA through the admin route", `${r.status}`);
r = await admin2.req(`/api/admin/users/${tiaId}`, { method: "PATCH", body: { resetTwoFactor: true } });
ok(r.status === 200, "a superadmin can reset a user's 2FA", r.text);
r = await t1.req("/api/account", { method: "PATCH", body: { name: "Tia" } });
ok(r.status === 401, "reset ends the user's sessions", `${r.status}`);
({ c: pw, x } = await tiaLogin());
ok(x.json?.ok === true && !x.json?.twoFactor && pw.jar.glitchlens_session, "after reset the user signs in with the password only", x.text);
// disable flow
r = await pw.req("/api/account/2fa/setup", { method: "POST" });
const secret2 = r.json.secret;
await pw.req("/api/account/2fa/enable", { method: "POST", body: { password: "tiapassword123", code: codeFor(secret2) } });
freeStep();
r = await pw.req("/api/account/2fa/disable", { method: "POST", body: { password: "tiapassword123", code: codeFor(secret2, 1) } });
ok(r.status === 204, "turning 2FA off needs password and code", `${r.status}`);
({ c: pw, x } = await tiaLogin());
ok(!x.json?.twoFactor, "after turning it off there is no second step");
// CLI break-glass
r = await pw.req("/api/account/2fa/setup", { method: "POST" });
const secret3 = r.json.secret;
await pw.req("/api/account/2fa/enable", { method: "POST", body: { password: "tiapassword123", code: codeFor(secret3) } });
const here = path.dirname(fileURLToPath(import.meta.url));
const cli = execFileSync(process.execPath, [path.join(here, "../reset-2fa.mjs"), "tia@example.com"], { env: { ...process.env, GLITCHLENS_DATA_DIR: DATA }, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
ok(/Two-factor reset/.test(cli), "the reset-2fa script reports success");
({ c: pw, x } = await tiaLogin());
ok(!x.json?.twoFactor && x.json?.ok === true, "the reset-2fa script lets the user back in with the password");
r = await admin2.req("/settings/audit");
ok(["2fa.enable", "2fa.disable", "2fa.reset", "2fa.reset_cli", "login.2fa_failed", "login.2fa_unreadable", "2fa.recovery_regenerate"].every((a) => r.text.includes(a)), "2FA events are audited", "");
ok(!r.text.includes(secret) && !r.text.includes(recovery[0]) && !r.text.includes(fresh[0]), "audit log contains no 2FA secrets or recovery codes");


// 17. Content-Security-Policy
const nonceOf = (csp) => csp?.match(/script-src[^;]*'nonce-([^']+)'/)?.[1];
const checkPage = async (client, path, label) => {
  const x = await client.req(path);
  const csp = x.headers.get("content-security-policy") ?? "";
  const nonce = nonceOf(csp);
  const inline = [...x.text.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]).filter((attrs) => !/\bsrc=/.test(attrs));
  const scripts = [...x.text.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
  ok(!!nonce && /strict-dynamic/.test(csp), `${label}: CSP with a nonce and strict-dynamic`, csp);
  ok(!/script-src[^;]*unsafe-(inline|eval)/.test(csp), `${label}: scripts are never allowed 'unsafe-inline' or 'unsafe-eval'`, csp);
  ok(scripts.length > 0 && scripts.every((a) => a.includes(`nonce="${nonce}"`)), `${label}: every script tag carries this request's nonce`, JSON.stringify(scripts.filter((a) => !a.includes(`nonce="${nonce}"`)).slice(0, 3)));
  ok(inline.every((a) => a.includes("nonce=")), `${label}: no inline script without a nonce`);
  return nonce;
};
const n1 = await checkPage(new Client(), "/login", "login");
const n2 = await checkPage(new Client(), "/login", "login (2nd request)");
ok(n1 && n2 && n1 !== n2, "the nonce is different on every request");
await checkPage(admin2, "/settings/account", "authenticated page");
await checkPage(admin2, "/this-page-does-not-exist", "404 page");
r = await new Client().req("/login");
const cspText = r.headers.get("content-security-policy") ?? "";
ok(/object-src 'none'/.test(cspText) && /frame-ancestors 'none'/.test(cspText) && /base-uri 'self'/.test(cspText) && /form-action 'self'/.test(cspText), "CSP blocks plugins, framing, base-tag and cross-site form posts");
ok(!/https?:\/\//.test(cspText.replace(/\s/g, "")), "CSP allows no third-party origins");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
