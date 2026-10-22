import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { SESSION_COOKIE, createSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { api } from "@/lib/glitchtip/api";
import { IssueSchema } from "@/lib/glitchtip/types";
import { createInstance } from "@/lib/instances";
import { createUser } from "@/lib/users";
import { fakeServer, sendJson, setRequest, withTempDataDir } from "./helpers.ts";

withTempDataDir();
afterEach(() => {
  setRequest(null);
  getDb().exec("DELETE FROM users; DELETE FROM instances");
});

async function connect() {
  const srv = await fakeServer((_req, res) => sendJson(res, 200, [], { "x-hits": "0" }));
  const iid = createInstance({ name: "i", baseUrl: srv.url, tokenMode: "shared", token: "t" });
  const uid = createUser({ email: "u@x.com", name: "U", role: "member", passwordHash: "h", instanceIds: [iid] });
  setRequest({ cookies: { [SESSION_COOKIE]: createSession(uid).token } });
  return srv;
}

type Call = [name: string, run: () => Promise<unknown>, method: string, path: string, body?: unknown];

// These are the endpoints GlitchTip documents (checked against its OpenAPI schema for 6.2.6).
const CALLS: Call[] = [
  ["organizations", () => api.organizations(), "GET", "/api/0/organizations/"],
  ["organization", () => api.organization("acme"), "GET", "/api/0/organizations/acme/"],
  ["members", () => api.members("acme"), "GET", "/api/0/organizations/acme/members/"],
  ["teams", () => api.teams("acme"), "GET", "/api/0/organizations/acme/teams/"],
  ["monitors", () => api.monitors("acme"), "GET", "/api/0/organizations/acme/monitors/"],
  ["projects", () => api.projects(), "GET", "/api/0/projects/"],
  ["organizationProjects", () => api.organizationProjects("acme"), "GET", "/api/0/organizations/acme/projects/"],
  ["project", () => api.project("acme", "web"), "GET", "/api/0/projects/acme/web/"],
  ["projectKeys", () => api.projectKeys("acme", "web"), "GET", "/api/0/projects/acme/web/keys/"],
  ["projectAlerts", () => api.projectAlerts("acme", "web"), "GET", "/api/0/projects/acme/web/alerts/"],
  ["projectEnvironments", () => api.projectEnvironments("acme", "web"), "GET", "/api/0/projects/acme/web/environments/"],
  ["issue", () => api.issue("5"), "GET", "/api/0/issues/5/"],
  ["issueLatestEvent", () => api.issueLatestEvent("5"), "GET", "/api/0/issues/5/events/latest/"],
  ["issueTags", () => api.issueTags("5"), "GET", "/api/0/issues/5/tags/"],
  ["issueComments", () => api.issueComments("5"), "GET", "/api/0/issues/5/comments/"],
  ["addIssueComment", () => api.addIssueComment("5", "hi"), "POST", "/api/0/issues/5/comments/", { data: { text: "hi" } }],
  ["updateIssue", () => api.updateIssue("5", { status: "resolved" }), "PUT", "/api/0/issues/5/", { status: "resolved" }],
  ["deleteIssue", () => api.deleteIssue("5"), "DELETE", "/api/0/issues/5/"],
  ["bulkUpdateIssues", () => api.bulkUpdateIssues("acme", ["1", "2"], { status: "ignored" }), "PUT", "/api/0/organizations/acme/issues/?id=1&id=2", { status: "ignored" }],
  ["bulkDeleteIssues", () => api.bulkDeleteIssues("acme", ["1", "2"]), "DELETE", "/api/0/organizations/acme/issues/?id=1&id=2"],
  ["releases", () => api.releases("acme"), "GET", "/api/0/organizations/acme/releases/"],
  ["logs", () => api.logs("acme"), "GET", "/api/0/organizations/acme/logs/"],
  ["transactionGroup", () => api.transactionGroup("acme", "9"), "GET", "/api/0/organizations/acme/transaction-groups/9/"],
  ["transactionSpans", () => api.transactionSpans("acme", "9"), "GET", "/api/0/organizations/acme/transaction-groups/9/spans/"],
  ["createProject", () => api.createProject("acme", "backend", { name: "P" }), "POST", "/api/0/teams/acme/backend/projects/", { name: "P" }],
  ["updateProject", () => api.updateProject("acme", "web", { name: "W" }), "PUT", "/api/0/projects/acme/web/", { name: "W" }],
  ["deleteProject", () => api.deleteProject("acme", "web"), "DELETE", "/api/0/projects/acme/web/"],
  ["createProjectKey", () => api.createProjectKey("acme", "web", { name: "ci" }), "POST", "/api/0/projects/acme/web/keys/", { name: "ci" }],
  ["deleteProjectKey", () => api.deleteProjectKey("acme", "web", "k1"), "DELETE", "/api/0/projects/acme/web/keys/k1/"],
  ["debugFiles", () => api.debugFiles("acme", "web"), "GET", "/api/0/projects/acme/web/files/dsyms/"],
  ["removeMember", () => api.removeMember("acme", "4"), "DELETE", "/api/0/organizations/acme/members/4/"],
  ["createTeam", () => api.createTeam("acme", { slug: "ops" }), "POST", "/api/0/organizations/acme/teams/", { slug: "ops" }],
  ["deleteTeam", () => api.deleteTeam("acme", "ops"), "DELETE", "/api/0/teams/acme/ops/"],
  ["addTeamProject", () => api.addTeamProject("acme", "ops", "web"), "POST", "/api/0/projects/acme/web/teams/ops/"],
  ["removeTeamProject", () => api.removeTeamProject("acme", "ops", "web"), "DELETE", "/api/0/projects/acme/web/teams/ops/"],
  ["alertRule", () => api.alertRule("acme", "web", "3"), "GET", "/api/0/projects/acme/web/alerts/3/"],
  ["createAlertRule", () => api.createAlertRule("acme", "web", { name: "A" }), "POST", "/api/0/projects/acme/web/alerts/", { name: "A" }],
  ["updateAlertRule", () => api.updateAlertRule("acme", "web", "3", { name: "B" }), "PUT", "/api/0/projects/acme/web/alerts/3/", { name: "B" }],
  ["deleteAlertRule", () => api.deleteAlertRule("acme", "web", "3"), "DELETE", "/api/0/projects/acme/web/alerts/3/"],
  ["updateOrganization", () => api.updateOrganization("acme", { name: "Acme" }), "PUT", "/api/0/organizations/acme/", { name: "Acme" }],
];

describe("every GlitchTip call goes to the documented endpoint", () => {
  for (const [name, run, method, path, body] of CALLS) {
    test(`${name}: ${method} ${path}`, async () => {
      const srv = await connect();
      await run();
      const r = srv.requests[0];
      assert.equal(r.method, method);
      assert.equal(r.path, path);
      if (body !== undefined) assert.deepEqual(JSON.parse(r.body), body);
      else assert.equal(r.body, "");
    });
  }
});

describe("calls with options", () => {
  test("issues forwards the filters and the pagination", async () => {
    const srv = await connect();
    await api.issues("acme", { query: "is:unresolved", project: ["1", "2"], environment: "prod", statsPeriod: "14d", sort: "freq", limit: 10, cursor: "C" });
    const url = new URL(srv.requests[0].path, "http://x");
    assert.equal(url.pathname, "/api/0/organizations/acme/issues/");
    assert.equal(url.searchParams.get("query"), "is:unresolved");
    assert.deepEqual(url.searchParams.getAll("project"), ["1", "2"]);
    assert.equal(url.searchParams.get("environment"), "prod");
    assert.equal(url.searchParams.get("statsPeriod"), "14d");
    assert.equal(url.searchParams.get("sort"), "freq");
    assert.equal(url.searchParams.get("limit"), "10");
    assert.equal(url.searchParams.get("cursor"), "C");
  });

  test("issues omits what is not set and defaults to 25 per page", async () => {
    const srv = await connect();
    await api.issues("acme");
    const url = new URL(srv.requests[0].path, "http://x");
    assert.deepEqual([...url.searchParams.keys()], ["limit"]);
    assert.equal(url.searchParams.get("limit"), "25");
  });

  test("transactionGroups paginates and filters by project", async () => {
    const srv = await connect();
    await api.transactionGroups("acme", { project: "7", sort: "-avg", limit: 5 });
    const url = new URL(srv.requests[0].path, "http://x");
    assert.equal(url.pathname, "/api/0/organizations/acme/transaction-groups/");
    assert.deepEqual([url.searchParams.get("project"), url.searchParams.get("sort"), url.searchParams.get("limit")], ["7", "-avg", "5"]);
  });

  test("stats sends the four parameters GlitchTip requires, with a default field", async () => {
    const srv = await connect();
    await api.stats("acme", { category: "error", start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", interval: "1h", project: "3" });
    const url = new URL(srv.requests[0].path, "http://x");
    assert.equal(url.pathname, "/api/0/organizations/acme/stats_v2/");
    assert.deepEqual(
      ["category", "start", "end", "field", "interval", "project"].map((k) => url.searchParams.get(k)),
      ["error", "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z", "sum(quantity)", "1h", "3"],
    );
  });

  test("stats groups by the given fields", async () => {
    const srv = await connect();
    await api.stats("acme", { category: "error", start: "s", end: "e", groupBy: ["project", "outcome"] });
    const url = new URL(srv.requests[0].path, "http://x");
    assert.equal(url.searchParams.get("groupBy"), "project");
    assert.equal(url.searchParams.get("groupBy1"), "outcome");
  });
});

describe("IssueSchema", () => {
  const valid = { id: "5", title: "Boom", level: "error", status: "unresolved" };

  test("accepts what GlitchTip sends, including extra fields and numeric ids", () => {
    assert.equal(IssueSchema.safeParse({ ...valid, count: "3", metadata: { type: "X" } }).success, true);
    assert.equal(IssueSchema.safeParse({ ...valid, id: 5 }).success, true);
    assert.equal(IssueSchema.safeParse({ ...valid, project: { slug: "web", name: "Web" }, lastSeen: "2026-01-01T00:00:00Z" }).success, true);
  });

  test("flags gross drift", () => {
    for (const bad of [{}, { ...valid, title: undefined }, { ...valid, id: null }, { ...valid, level: 3 }, "x", null]) {
      assert.equal(IssueSchema.safeParse(bad).success, false, JSON.stringify(bad));
    }
  });
});
