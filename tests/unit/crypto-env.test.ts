import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { withTempDataDir } from "./helpers.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const dir = withTempDataDir();
const KEY_A = "a".repeat(40);
const KEY_B = "b".repeat(40);

/** Runs the real crypto module in a fresh process, because the key is read once per process. */
function inChild(code: string, env: Record<string, string>): string {
  return execFileSync(
    process.execPath,
    ["--no-warnings", "--experimental-transform-types", "--import", path.join(root, "scripts/test/register.mjs"), "-e", code],
    { cwd: root, env: { ...process.env, GLITCHLENS_DATA_DIR: dir, ...env }, encoding: "utf8" },
  );
}

const ENCRYPT = `import("@/lib/crypto").then((m) => process.stdout.write(m.encryptSecret("the-token")))`;
const decrypt = (blob: string) => `import("@/lib/crypto").then((m) => process.stdout.write(String(m.decryptSecret(${JSON.stringify(blob)}))))`;

describe("GLITCHLENS_SECRET", () => {
  test("encrypts under the given key and only that key can read it", () => {
    const blob = inChild(ENCRYPT, { GLITCHLENS_SECRET: KEY_A });
    assert.equal(inChild(decrypt(blob), { GLITCHLENS_SECRET: KEY_A }), "the-token");
    assert.equal(inChild(decrypt(blob), { GLITCHLENS_SECRET: KEY_B }), "null", "another key must not decrypt it");
  });

  test("a rotated key makes old ciphertext unreadable, never wrong", () => {
    const blob = inChild(ENCRYPT, { GLITCHLENS_SECRET: KEY_A });
    assert.equal(inChild(decrypt(blob), { GLITCHLENS_SECRET: "c".repeat(64) }), "null");
  });

  test("refuses a key shorter than 32 characters", () => {
    assert.throws(
      () => inChild(ENCRYPT, { GLITCHLENS_SECRET: "too-short" }),
      (e: Error & { stderr?: string }) => /at least 32 characters/.test(String(e.stderr ?? e.message)),
    );
  });

  test("when set, no key file is written next to the database", () => {
    inChild(ENCRYPT, { GLITCHLENS_SECRET: KEY_A });
    assert.throws(() => inChild(`require("node:fs").statSync(${JSON.stringify(path.join(dir, "secret.key"))})`, {}));
  });
});
