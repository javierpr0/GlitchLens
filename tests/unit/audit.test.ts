import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { listAudit, pruneAudit, recordAudit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { captureErrors, withTempDataDir } from "./helpers.ts";

withTempDataDir();
const DAY = 24 * 60 * 60 * 1000;

afterEach(() => {
  delete process.env.GLITCHLENS_TRUST_PROXY;
  getDb().exec("DELETE FROM audit_log");
});

describe("recordAudit", () => {
  test("stores who did what to whom, newest first", () => {
    recordAudit({ actor: { id: 1, email: "root@x.com" }, action: "user.create", target: "mia@x.com", detail: { role: "member" } });
    recordAudit({ actor: { id: 1, email: "root@x.com" }, action: "user.delete", target: "mia@x.com" });
    const [latest, first] = listAudit();
    assert.equal(latest.action, "user.delete");
    assert.equal(first.action, "user.create");
    assert.equal(first.actorEmail, "root@x.com");
    assert.equal(first.target, "mia@x.com");
    assert.deepEqual(JSON.parse(first.detail!), { role: "member" });
    assert.ok(Math.abs(first.at - Date.now()) < 5000);
  });

  test("records events that have no signed-in actor", () => {
    recordAudit({ actor: null, actorEmail: "ghost@x.com", action: "login.locked", target: "ghost@x.com" });
    const [entry] = listAudit();
    assert.equal(entry.actorEmail, "ghost@x.com");
    assert.equal(getDb().prepare("SELECT actor_id FROM audit_log").get()?.actor_id, null);
  });

  test("a signed-in actor wins over the fallback email", () => {
    recordAudit({ actor: { id: 5, email: "real@x.com" }, actorEmail: "spoof@x.com", action: "login" });
    assert.equal(listAudit()[0].actorEmail, "real@x.com");
  });

  test("bounds every free-text field", () => {
    recordAudit({
      actor: null,
      actorEmail: "e".repeat(1000),
      action: "x",
      target: "t".repeat(1000),
      detail: { big: "d".repeat(5000) },
    });
    const [entry] = listAudit();
    assert.equal(entry.actorEmail!.length, 254);
    assert.equal(entry.target!.length, 300);
    assert.equal(entry.detail!.length, 500);
  });

  test("keeps hostile text as plain data", () => {
    recordAudit({ actor: null, actorEmail: "<script>alert(1)</script>", action: "login.locked", target: "'; DROP TABLE users;--" });
    const [entry] = listAudit();
    assert.equal(entry.actorEmail, "<script>alert(1)</script>");
    assert.equal(entry.target, "'; DROP TABLE users;--");
    assert.ok(getDb().prepare("SELECT 1 FROM sqlite_master WHERE name = 'audit_log'").get());
  });

  test("records an IP only when a trusted proxy is declared", () => {
    const headers = new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.7" });
    recordAudit({ actor: null, action: "a", headers });
    assert.equal(listAudit()[0].ip, null);
    process.env.GLITCHLENS_TRUST_PROXY = "true";
    recordAudit({ actor: null, action: "b", headers });
    assert.equal(listAudit()[0].ip, "10.0.0.7", "the hop added by our own proxy, not the client-supplied one");
  });

  test("never throws, even if the log cannot be written", async () => {
    getDb().exec("ALTER TABLE audit_log RENAME TO audit_log_gone");
    try {
      const { logged } = await captureErrors(() => recordAudit({ actor: null, action: "x" }));
      assert.equal(logged.length, 1);
      assert.match(logged[0], /could not write audit log/);
    } finally {
      getDb().exec("ALTER TABLE audit_log_gone RENAME TO audit_log");
    }
  });
});

describe("listAudit", () => {
  const seed = (n: number) => {
    for (let i = 1; i <= n; i++) recordAudit({ actor: null, action: `e${i}` });
  };

  test("pages by id with `before`", () => {
    seed(7);
    const first = listAudit(undefined, 3);
    assert.deepEqual(first.map((e) => e.action), ["e7", "e6", "e5"]);
    const second = listAudit(first.at(-1)!.id, 3);
    assert.deepEqual(second.map((e) => e.action), ["e4", "e3", "e2"]);
    const third = listAudit(second.at(-1)!.id, 3);
    assert.deepEqual(third.map((e) => e.action), ["e1"]);
    assert.deepEqual(listAudit(third.at(-1)!.id, 3), []);
  });

  test("defaults to a page of 100", () => {
    seed(120);
    assert.equal(listAudit().length, 100);
  });
});

describe("pruneAudit", () => {
  test("deletes events older than 180 days and keeps the rest", () => {
    const db = getDb();
    const insert = db.prepare("INSERT INTO audit_log (at, action) VALUES (?, ?)");
    insert.run(Date.now() - 181 * DAY, "old");
    insert.run(Date.now() - 179 * DAY, "recent");
    insert.run(Date.now(), "now");
    pruneAudit();
    assert.deepEqual(listAudit().map((e) => e.action).sort(), ["now", "recent"]);
  });
});
