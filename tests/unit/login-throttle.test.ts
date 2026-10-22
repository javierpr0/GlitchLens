import assert from "node:assert/strict";
import { afterEach, describe, mock, test } from "node:test";
import { getDb } from "@/lib/db";
import { clearFailures, clientIp, lockedFor, recordFailure } from "@/lib/login-throttle";
import { throttleMemory, withTempDataDir } from "./helpers.ts";

withTempDataDir();
const MIN = 60 * 1000;

afterEach(() => {
  mock.timers.reset();
  getDb().exec("DELETE FROM login_attempts");
  throttleMemory().clear();
  delete process.env.GLITCHLENS_TRUST_PROXY;
});

const fail = (email: string, times: number, exists = true, ip: string | null = null) => {
  for (let i = 0; i < times; i++) recordFailure(email, ip, exists);
};

describe("per-account lock for real accounts (stored in the database)", () => {
  test("locks on the fifth failure, not before", () => {
    fail("a@x.com", 4);
    assert.equal(lockedFor("a@x.com", null), 0);
    fail("a@x.com", 1);
    const wait = lockedFor("a@x.com", null);
    assert.ok(wait > 14 * 60 && wait <= 15 * 60, `retry in ${wait}s`);
  });

  test("the lock lasts 15 minutes and then opens", () => {
    mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
    fail("a@x.com", 5);
    assert.ok(lockedFor("a@x.com", null) > 0);
    mock.timers.tick(14 * MIN);
    assert.ok(lockedFor("a@x.com", null) > 0, "still locked after 14 minutes");
    mock.timers.tick(2 * MIN);
    assert.equal(lockedFor("a@x.com", null), 0, "open after 16 minutes");
  });

  test("failures older than the window are forgotten", () => {
    mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
    fail("a@x.com", 4);
    mock.timers.tick(16 * MIN);
    fail("a@x.com", 4);
    assert.equal(lockedFor("a@x.com", null), 0, "4 + 4 across two windows is not 8");
  });

  test("a successful login clears the counter", () => {
    fail("a@x.com", 4);
    clearFailures("a@x.com");
    fail("a@x.com", 4);
    assert.equal(lockedFor("a@x.com", null), 0);
  });

  test("accounts are independent and emails are compared case-insensitively", () => {
    fail("Mixed@X.com", 3);
    fail("mixed@x.COM", 2);
    assert.ok(lockedFor("MIXED@x.com", null) > 0, "5 failures across spellings");
    assert.equal(lockedFor("other@x.com", null), 0);
  });

  test("a locked account stays locked when the lock is read through any spelling", () => {
    fail("a@x.com", 5);
    assert.ok(lockedFor("A@X.COM", null) > 0);
  });

  test("expired rows are cleaned up when a new failure is recorded", () => {
    mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
    fail("old@x.com", 2);
    mock.timers.tick(20 * MIN);
    fail("new@x.com", 1);
    const keys = (getDb().prepare("SELECT key FROM login_attempts").all() as Array<{ key: string }>).map((r) => r.key);
    assert.deepEqual(keys, ["email:new@x.com"]);
  });
});

describe("made-up emails are counted in memory, and look the same from outside", () => {
  test("lock after five failures like a real account", () => {
    fail("ghost@x.com", 4, false);
    assert.equal(lockedFor("ghost@x.com", null), 0);
    fail("ghost@x.com", 1, false);
    assert.ok(lockedFor("ghost@x.com", null) > 0);
  });

  test("never touch the database", () => {
    fail("ghost@x.com", 10, false);
    assert.equal((getDb().prepare("SELECT COUNT(*) AS n FROM login_attempts").get() as { n: number }).n, 0);
  });

  test("clearFailures forgets them", () => {
    fail("ghost@x.com", 5, false);
    clearFailures("ghost@x.com");
    assert.equal(lockedFor("ghost@x.com", null), 0);
  });

  test("a flood of fake emails stays bounded in memory", () => {
    for (let i = 0; i < 10_500; i++) fail(`fake${i}@x.com`, 1, false);
    assert.ok(throttleMemory().size <= 10_000, `${throttleMemory().size} entries`);
  });

  test("a flood of fake emails cannot reset a real account's counter", () => {
    fail("real@x.com", 3);
    for (let i = 0; i < 10_500; i++) fail(`fake${i}@x.com`, 1, false);
    fail("real@x.com", 2);
    assert.ok(lockedFor("real@x.com", null) > 0, "3 before the flood + 2 after = locked");
  });
});

describe("per-IP lock (only with a trusted proxy)", () => {
  test("locks an address after 25 failures across any emails", () => {
    for (let i = 0; i < 24; i++) fail(`u${i}@x.com`, 1, false, "7.7.7.7");
    assert.equal(lockedFor("fresh@x.com", "7.7.7.7"), 0);
    fail("u24@x.com", 1, false, "7.7.7.7");
    assert.ok(lockedFor("fresh@x.com", "7.7.7.7") > 0, "a brand-new email from that address is locked too");
    assert.equal(lockedFor("fresh@x.com", "8.8.8.8"), 0, "other addresses are not");
  });

  test("without an IP there is no per-IP counting at all", () => {
    for (let i = 0; i < 50; i++) fail(`u${i}@x.com`, 1, false, null);
    assert.equal(lockedFor("fresh@x.com", null), 0);
  });
});

describe("clientIp", () => {
  const h = (init: Record<string, string>) => new Headers(init);

  test("is null unless GLITCHLENS_TRUST_PROXY=true, whatever the headers say", () => {
    assert.equal(clientIp(h({ "x-forwarded-for": "1.1.1.1" })), null);
    process.env.GLITCHLENS_TRUST_PROXY = "yes";
    assert.equal(clientIp(h({ "x-forwarded-for": "1.1.1.1" })), null);
    process.env.GLITCHLENS_TRUST_PROXY = "false";
    assert.equal(clientIp(h({ "x-forwarded-for": "1.1.1.1" })), null);
  });

  test("trusts the last hop: the one our own proxy added", () => {
    process.env.GLITCHLENS_TRUST_PROXY = "true";
    assert.equal(clientIp(h({ "x-forwarded-for": "6.6.6.6, 2.2.2.2" })), "2.2.2.2");
    assert.equal(clientIp(h({ "x-forwarded-for": "  2.2.2.2  " })), "2.2.2.2");
  });

  test("falls back to x-real-ip, then to null", () => {
    process.env.GLITCHLENS_TRUST_PROXY = "true";
    assert.equal(clientIp(h({ "x-real-ip": " 3.3.3.3 " })), "3.3.3.3");
    assert.equal(clientIp(h({})), null);
    assert.equal(clientIp(h({ "x-forwarded-for": " , " })), null);
  });
});
