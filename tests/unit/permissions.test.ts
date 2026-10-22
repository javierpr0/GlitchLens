import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { canAccess } from "@/lib/permissions";
import type { TokenMode } from "@/lib/instances";
import type { Role } from "@/lib/users";

type Case = [method: string, path: string, expected: boolean];
const check = (role: Role, mode: TokenMode, cases: Case[]) => {
  for (const [method, path, expected] of cases) {
    assert.equal(canAccess(role, method, path, mode), expected, `${role}/${mode} ${method} ${path}`);
  }
};

const READS: Case[] = [
  ["GET", "organizations/", true],
  ["GET", "organizations/acme/issues/", true],
  ["GET", "issues/5/events/latest/", true],
  ["GET", "projects/acme/web/keys/", true],
  ["HEAD", "organizations/acme/", true],
  ["OPTIONS", "organizations/acme/", true],
  ["get", "organizations/acme/", true],
];

describe("viewer", () => {
  test("can read, never write, in either mode", () => {
    for (const mode of ["shared", "per_user"] as const) {
      check("viewer", mode, [
        ...READS.filter(([, path]) => !path.startsWith("users")),
        ["POST", "organizations/acme/teams/", false],
        ["PUT", "issues/5/", false],
        ["PATCH", "issues/5/", false],
        ["DELETE", "issues/5/", false],
        ["post", "issues/5/comments/", false],
      ]);
    }
  });

  test("cannot read the token owner's account through a shared token", () => {
    check("viewer", "shared", [
      ["GET", "users/me/", false],
      ["GET", "users/", false],
      ["GET", "api-tokens/", false],
    ]);
  });

  test("a per-user token is the viewer's own, so reading it is fine", () => {
    check("viewer", "per_user", [["GET", "users/me/", true]]);
  });
});

describe("superadmin", () => {
  test("can do everything in either mode, including the owner's account", () => {
    for (const mode of ["shared", "per_user"] as const) {
      check("superadmin", mode, [
        ...READS,
        ["GET", "users/me/", true],
        ["GET", "api-tokens/", true],
        ["DELETE", "organizations/acme/members/1/", true],
        ["DELETE", "projects/acme/web/", true],
        ["PUT", "organizations/acme/", true],
        ["POST", "organizations/", true],
      ]);
    }
  });
});

describe("member with a shared token", () => {
  test("can read ordinary data", () => {
    check("member", "shared", READS);
  });

  test("works with issues, alerts, keys and projects", () => {
    check("member", "shared", [
      ["PUT", "issues/5/", true],
      ["DELETE", "issues/5/", true],
      ["PUT", "organizations/acme/issues/", true],
      ["DELETE", "organizations/acme/issues/", true],
      ["POST", "issues/5/comments/", true],
      ["POST", "projects/acme/web/alerts/", true],
      ["PUT", "projects/acme/web/alerts/3/", true],
      ["DELETE", "projects/acme/web/alerts/3/", true],
      ["POST", "projects/acme/web/keys/", true],
      ["DELETE", "projects/acme/web/keys/abc/", true],
      ["PUT", "projects/acme/web/", true],
      ["POST", "organizations/acme/teams/", true],
      ["POST", "teams/acme/backend/projects/", true],
    ]);
  });

  test("cannot reach the token owner's account or credentials, even to read", () => {
    check("member", "shared", [
      ["GET", "users/me/", false],
      ["GET", "users/", false],
      ["GET", "users/me/notifications/", false],
      ["PUT", "users/me/", false],
      ["GET", "api-tokens/", false],
      ["POST", "api-tokens/", false],
      ["DELETE", "api-tokens/9/", false],
    ]);
  });

  test("cannot manage organization members, but may list them", () => {
    check("member", "shared", [
      ["GET", "organizations/acme/members/", true],
      ["GET", "organizations/acme/members/4/", true],
      ["POST", "organizations/acme/members/", false],
      ["PUT", "organizations/acme/members/4/", false],
      ["DELETE", "organizations/acme/members/4/", false],
      ["POST", "organizations/acme/members/4/set_owner/", false],
      ["DELETE", "organizations/acme/members/4/teams/backend/", false],
    ]);
  });

  test("cannot create, rename or delete organizations", () => {
    check("member", "shared", [
      ["POST", "organizations/", false],
      ["PUT", "organizations/acme/", false],
      ["PATCH", "organizations/acme/", false],
      ["DELETE", "organizations/acme/", false],
      ["PUT", "organizations/acme", false],
    ]);
  });

  test("cannot delete projects or teams", () => {
    check("member", "shared", [
      ["DELETE", "projects/acme/web/", false],
      ["DELETE", "projects/acme/web", false],
      ["DELETE", "teams/acme/backend/", false],
    ]);
  });

  test("tolerates leading and trailing slashes and any method casing", () => {
    check("member", "shared", [
      ["delete", "/organizations/acme/members/4/", false],
      ["DELETE", "organizations/acme/members/4", false],
      ["GET", "/users/me", false],
      ["Get", "users/me//", false],
    ]);
  });
});

describe("member with a per-user token", () => {
  test("GlitchTip enforces the person's own permissions, so nothing is blocked locally", () => {
    check("member", "per_user", [
      ["GET", "users/me/", true],
      ["DELETE", "organizations/acme/members/4/", true],
      ["DELETE", "projects/acme/web/", true],
      ["PUT", "organizations/acme/", true],
      ["POST", "organizations/", true],
      ["DELETE", "teams/acme/backend/", true],
    ]);
  });
});
