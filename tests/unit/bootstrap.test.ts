import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, mock, test } from "node:test";
import { bootstrap, clearSetupCode, setupPending, verifySetupCode } from "@/lib/bootstrap";
import { getDb } from "@/lib/db";
import { listUsers, verifyLogin } from "@/lib/users";
import { captureErrors, freshDatabase } from "./helpers.ts";

const ENV = ["GLITCHLENS_ADMIN_EMAIL", "GLITCHLENS_ADMIN_PASSWORD", "GLITCHLENS_SETUP_CODE"] as const;

beforeEach(() => {
  for (const k of ENV) delete process.env[k];
  freshDatabase();
});
afterEach(() => mock.restoreAll());

const printed = async (): Promise<{ output: string; code: string | null }> => {
  const lines: string[] = [];
  mock.method(console, "log", (...a: unknown[]) => void lines.push(a.join(" ")));
  await bootstrap();
  const output = lines.join("\n");
  // With GLITCHLENS_SETUP_CODE the line says where the code lives instead of printing it.
  const printedCode = output.includes("the value of GLITCHLENS_SETUP_CODE") ? null : (output.match(/Setup code: (\S+)/)?.[1] ?? null);
  return { output, code: printedCode };
};

describe("first start with no users", () => {
  test("prints a random setup code that opens /setup, and nothing else does", async () => {
    const { output, code } = await printed();
    assert.ok(code && code.length >= 10, output);
    assert.equal(setupPending(), true);
    assert.equal(verifySetupCode(code!), true);
    assert.equal(verifySetupCode(` ${code} `), true, "surrounding spaces are forgiven");
    for (const wrong of ["", "wrong", code!.slice(1), code!.toLowerCase() === code ? code!.toUpperCase() : code!.toLowerCase()]) {
      assert.equal(verifySetupCode(wrong), false, JSON.stringify(wrong));
    }
  });

  test("a new start prints a new code and the old one stops working", async () => {
    const first = (await printed()).code!;
    const second = (await printed()).code!;
    assert.notEqual(first, second);
    assert.equal(verifySetupCode(first), false);
    assert.equal(verifySetupCode(second), true);
  });

  test("the code is stored hashed, never in clear", async () => {
    const { code } = await printed();
    const stored = getDb().prepare("SELECT value FROM settings WHERE key = 'setup_code_hash'").get()!.value as string;
    assert.ok(!stored.includes(code!));
    assert.match(stored, /^[0-9a-f]{64}$/);
  });

  test("GLITCHLENS_SETUP_CODE replaces the random code and is not echoed to the console", async () => {
    process.env.GLITCHLENS_SETUP_CODE = "my-fixed-setup-code";
    const { output, code } = await printed();
    assert.equal(code, null);
    assert.match(output, /the value of GLITCHLENS_SETUP_CODE/);
    assert.ok(!output.includes("my-fixed-setup-code"));
    assert.equal(verifySetupCode("my-fixed-setup-code"), true);
    assert.equal(verifySetupCode("other"), false);
  });

  test("nothing verifies when no code was ever prepared", () => {
    assert.equal(verifySetupCode("anything"), false);
    assert.equal(verifySetupCode(""), false);
  });

  test("clearSetupCode closes the door", async () => {
    const { code } = await printed();
    clearSetupCode();
    assert.equal(verifySetupCode(code!), false);
  });
});

describe("seeding the superadmin from the environment", () => {
  test("creates the account, prints no setup code, and the password works", async () => {
    process.env.GLITCHLENS_ADMIN_EMAIL = "  admin@example.com ";
    process.env.GLITCHLENS_ADMIN_PASSWORD = "a-good-long-password";
    const { output, code } = await printed();
    assert.equal(code, null);
    assert.match(output, /Superadmin admin@example.com created/);
    assert.ok(!output.includes("a-good-long-password"), "the password is never printed");
    const [u] = listUsers();
    assert.deepEqual([u.email, u.role, u.name], ["admin@example.com", "superadmin", "Admin"]);
    assert.equal(setupPending(), false);
    assert.equal((await verifyLogin("admin@example.com", "a-good-long-password", null)).ok, true);
  });

  test("a password outside the allowed length falls back to the setup page and says so", async () => {
    process.env.GLITCHLENS_ADMIN_EMAIL = "admin@example.com";
    for (const pw of ["short", "x".repeat(129)]) {
      freshDatabase();
      process.env.GLITCHLENS_ADMIN_PASSWORD = pw;
      const { result, logged } = await captureErrors(printed);
      assert.equal(listUsers().length, 0, "no account with a weak password");
      assert.ok(result.code, "a setup code is printed instead");
      assert.match(logged.join("\n"), /GLITCHLENS_ADMIN_PASSWORD must be/);
    }
  });

  test("an email without a password (or the reverse) is ignored", async () => {
    process.env.GLITCHLENS_ADMIN_EMAIL = "admin@example.com";
    assert.ok((await printed()).code);
    assert.equal(listUsers().length, 0);
  });

  test("does nothing once any user exists, and removes a leftover setup code", async () => {
    const { code } = await printed();
    process.env.GLITCHLENS_ADMIN_EMAIL = "late@example.com";
    process.env.GLITCHLENS_ADMIN_PASSWORD = "a-good-long-password";
    await bootstrap(); // seeds late@example.com
    assert.equal(listUsers().length, 1);
    process.env.GLITCHLENS_ADMIN_EMAIL = "another@example.com";
    await bootstrap();
    assert.equal(listUsers().length, 1, "the second start does not create another account");
    assert.equal(verifySetupCode(code!), false, "and the setup door stays shut");
  });
});
