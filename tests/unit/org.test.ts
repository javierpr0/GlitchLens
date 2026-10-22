import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { SESSION_COOKIE, createSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { INSTANCE_COOKIE, createInstance } from "@/lib/instances";
import { getActiveOrg, getActiveOrgSlug, listOrganizations, orgCookieName } from "@/lib/org";
import { InstanceAuthError } from "@/lib/glitchtip/client";
import { createUser } from "@/lib/users";
import { fakeServer, sendJson, setRequest, withTempDataDir, type FakeServer } from "./helpers.ts";

withTempDataDir();
afterEach(() => {
  setRequest(null);
  getDb().exec("DELETE FROM users; DELETE FROM instances");
});

const org = (slug: string) => ({ id: slug, slug, name: slug.toUpperCase(), status: { id: "active", name: "active" }, isAcceptingEvents: true });
const server = (status: number, body: unknown) => fakeServer((_req, res) => sendJson(res, status, body));
let seq = 0;
function connect(srv: FakeServer, cookies: Record<string, string> = {}) {
  const iid = createInstance({ name: `i${++seq}`, baseUrl: srv.url, tokenMode: "shared", token: "t" });
  const uid = createUser({ email: `u${seq}@x.com`, name: "U", role: "member", passwordHash: "h", instanceIds: [iid] });
  setRequest({ cookies: { [SESSION_COOKIE]: createSession(uid).token, [INSTANCE_COOKIE]: String(iid), ...cookies } });
  return iid;
}

describe("organization cookies", () => {
  test("are per instance, because slugs mean nothing across servers", () => {
    assert.equal(orgCookieName(1), "gl_org_1");
    assert.notEqual(orgCookieName(1), orgCookieName(2));
  });
});

describe("listOrganizations / getActiveOrg", () => {
  test("lists what the token can see", async () => {
    connect(await server(200, [org("acme"), org("beta")]));
    assert.deepEqual((await listOrganizations()).map((o) => o.slug), ["acme", "beta"]);
  });

  test("defaults to the first organization", async () => {
    connect(await server(200, [org("acme"), org("beta")]));
    assert.equal(await getActiveOrgSlug(), "acme");
  });

  test("honours the cookie for this instance", async () => {
    const srv = await server(200, [org("acme"), org("beta")]);
    const iid = connect(srv);
    setRequest({ cookies: { ...(await cookiesNow()), [orgCookieName(iid)]: "beta" } });
    assert.equal(await getActiveOrgSlug(), "beta");
    assert.equal((await getActiveOrg())!.name, "BETA");
  });

  test("ignores a cookie naming an organization the token cannot see", async () => {
    const iid = connect(await server(200, [org("acme")]));
    setRequest({ cookies: { ...(await cookiesNow()), [orgCookieName(iid)]: "not-mine" } });
    assert.equal(await getActiveOrgSlug(), "acme");
  });

  test("another instance's organization cookie does not apply", async () => {
    const iid = connect(await server(200, [org("acme"), org("beta")]));
    setRequest({ cookies: { ...(await cookiesNow()), [orgCookieName(iid + 100)]: "beta" } });
    assert.equal(await getActiveOrgSlug(), "acme");
  });

  test("is null when the token sees no organization", async () => {
    connect(await server(200, []));
    assert.equal(await getActiveOrg(), null);
    assert.equal(await getActiveOrgSlug(), null);
  });

  test("a 403 on the list means the token cannot do its job: same as a bad token", async () => {
    connect(await server(403, { detail: "nope" }));
    await assert.rejects(listOrganizations(), InstanceAuthError);
  });

  test("a 401 stays an instance-token error", async () => {
    connect(await server(401, {}));
    await assert.rejects(listOrganizations(), InstanceAuthError);
  });
});

async function cookiesNow() {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  return Object.fromEntries(
    [SESSION_COOKIE, INSTANCE_COOKIE].flatMap((n) => {
      const c = jar.get(n);
      return c ? [[n, c.value]] : [];
    }),
  );
}
