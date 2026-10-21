import { readFileSync, statSync } from "node:fs";

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
r = await admin2.req(`/api/admin/instances/${idC}`, { method: "PATCH", body: { tokenMode: "shared" } });
ok(r.status === 400, "switching to shared requires a shared token", `${r.status} ${r.text}`);
r = await admin2.req(`/api/admin/instances/${idC}`, { method: "PATCH", body: { tokenMode: "shared", token: "tokC-shared" } });
ok(r.status === 200, "can switch per-user to shared with a token", r.text);
r = await neo.req("/api/account/tokens", { method: "POST", body: { instanceId: idC, token: "tokC-x" } });
ok(r.status === 404, "personal tokens no longer accepted once instance is shared", `${r.status}`);
r = await neo.req("/api/glitchtip/projects/acme/web", { method: "DELETE" });
ok(r.status === 403, "after switching to shared, local role limits apply again", `${r.status}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
