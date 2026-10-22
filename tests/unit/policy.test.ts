import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getDb } from "@/lib/db";
import { TWO_FACTOR_POLICIES, getTwoFactorPolicy, mustEnrollTwoFactor, setTwoFactorPolicy } from "@/lib/policy";
import type { Role } from "@/lib/users";
import { withTempDataDir } from "./helpers.ts";

withTempDataDir();

describe("mustEnrollTwoFactor", () => {
  const roles: Role[] = ["superadmin", "member", "viewer"];

  test("is never required when the policy is off", () => {
    for (const role of roles) for (const has of [true, false]) assert.equal(mustEnrollTwoFactor(role, has, "off"), false);
  });

  test("never bothers an account that already has 2FA", () => {
    for (const role of roles) for (const policy of TWO_FACTOR_POLICIES) assert.equal(mustEnrollTwoFactor(role, true, policy), false);
  });

  test("'superadmins' covers only superadmins", () => {
    assert.equal(mustEnrollTwoFactor("superadmin", false, "superadmins"), true);
    assert.equal(mustEnrollTwoFactor("member", false, "superadmins"), false);
    assert.equal(mustEnrollTwoFactor("viewer", false, "superadmins"), false);
  });

  test("'all' covers everyone without 2FA", () => {
    for (const role of roles) assert.equal(mustEnrollTwoFactor(role, false, "all"), true);
  });
});

describe("stored policy", () => {
  test("defaults to off", () => {
    assert.equal(getTwoFactorPolicy(), "off");
  });

  test("is saved and read back, and can be changed", () => {
    setTwoFactorPolicy("superadmins");
    assert.equal(getTwoFactorPolicy(), "superadmins");
    setTwoFactorPolicy("all");
    assert.equal(getTwoFactorPolicy(), "all");
    setTwoFactorPolicy("off");
    assert.equal(getTwoFactorPolicy(), "off");
  });

  test("a corrupted stored value fails open to 'off' rather than locking everyone out", () => {
    for (const junk of ["", "ALL", "everyone", "1", "superadmin"]) {
      getDb().prepare("INSERT INTO settings (key, value) VALUES ('require_2fa', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(junk);
      assert.equal(getTwoFactorPolicy(), "off", JSON.stringify(junk));
    }
  });
});
