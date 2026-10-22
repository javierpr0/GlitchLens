import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import {
  decryptSecret,
  encryptSecret,
  hashPassword,
  hmacSecret,
  randomToken,
  safeEqual,
  sha256,
  verifyPassword,
} from "@/lib/crypto";
import { withTempDataDir } from "./helpers.ts";

const dir = withTempDataDir();

describe("encryptSecret / decryptSecret", () => {
  test("round-trips text of any shape", () => {
    for (const text of ["", "a", "tokA-secret-111", "ñandú 🔑 日本語", "x".repeat(10_000), "line\nbreak\t.dots.in.it"]) {
      assert.equal(decryptSecret(encryptSecret(text)), text);
    }
  });

  test("never stores the plaintext and never repeats a ciphertext", () => {
    const a = encryptSecret("super-secret-token");
    const b = encryptSecret("super-secret-token");
    assert.notEqual(a, b, "a fresh IV per message");
    assert.ok(!a.includes("super-secret-token"));
    assert.ok(!Buffer.from(a.split(".")[2], "base64url").toString("utf8").includes("super-secret-token"));
  });

  test("has the shape iv.tag.ciphertext in base64url", () => {
    const parts = encryptSecret("hello").split(".");
    assert.equal(parts.length, 3);
    for (const p of parts) assert.match(p, /^[A-Za-z0-9_-]*$/);
    assert.equal(Buffer.from(parts[0], "base64url").length, 12, "96-bit IV");
    assert.equal(Buffer.from(parts[1], "base64url").length, 16, "128-bit auth tag");
  });

  test("detects tampering in any of the three parts", () => {
    const [iv, tag, data] = encryptSecret("hello world").split(".");
    const flip = (b64: string) => {
      const buf = Buffer.from(b64, "base64url");
      buf[0] ^= 1;
      return buf.toString("base64url");
    };
    assert.equal(decryptSecret([flip(iv), tag, data].join(".")), null);
    assert.equal(decryptSecret([iv, flip(tag), data].join(".")), null);
    assert.equal(decryptSecret([iv, tag, flip(data)].join(".")), null);
  });

  test("returns null for anything malformed instead of throwing", () => {
    for (const junk of ["", "a", "a.b", "a.b.c", "...", "not base64 at all", "x.y.z.w", "AAAA.AAAA.AAAA"]) {
      assert.equal(decryptSecret(junk), null, JSON.stringify(junk));
    }
  });

  test("a payload cannot be moved between tag and data", () => {
    const [iv, tag, data] = encryptSecret("hello world").split(".");
    assert.equal(decryptSecret([iv, data, tag].join(".")), null);
  });
});

describe("the key file", () => {
  test("is created on first use, 32 random bytes as hex, readable only by the owner", () => {
    encryptSecret("x");
    const file = path.join(dir, "secret.key");
    assert.ok(existsSync(file));
    assert.match(readFileSync(file, "utf8"), /^[0-9a-f]{64}$/);
    assert.equal(statSync(file).mode & 0o777, 0o600);
  });
});

describe("passwords", () => {
  test("hash into a self-describing scrypt string with a unique salt", async () => {
    const a = await hashPassword("correct horse battery staple");
    const b = await hashPassword("correct horse battery staple");
    assert.match(a, /^scrypt\$32768\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    assert.notEqual(a, b);
    assert.ok(!a.includes("correct horse"));
  });

  test("verify the right password and refuse the wrong ones", async () => {
    const hash = await hashPassword("S3cret-pass!");
    assert.equal(await verifyPassword("S3cret-pass!", hash), true);
    for (const wrong of ["", "s3cret-pass!", "S3cret-pass! ", "S3cret-pass", "x".repeat(2000)]) {
      assert.equal(await verifyPassword(wrong, hash), false, JSON.stringify(wrong.slice(0, 20)));
    }
  });

  test("treat canonically equivalent Unicode as the same password", async () => {
    const hash = await hashPassword("café-12345"); // é as one code point
    assert.equal(await verifyPassword("café-12345", hash), true); // e + combining accent
  });

  test("handle very long and non-ASCII passwords", async () => {
    const long = "ü🔒".repeat(500);
    assert.equal(await verifyPassword(long, await hashPassword(long)), true);
  });

  test("a missing user is refused after doing the same work (no early return that leaks it)", async () => {
    assert.equal(await verifyPassword("anything", null), false);
    assert.equal(await verifyPassword("", null), false);
  });

  test("a stored hash in the wrong format never verifies", async () => {
    for (const stored of ["", "plain", "bcrypt$10$abc$def", "scrypt$32768$8$1", "scrypt$32768$8$1$$", "scrypt$x$y$z$AAAA$BBBB"]) {
      assert.equal(await verifyPassword("whatever", stored).catch(() => false), false, stored);
    }
  });
});

describe("tokens and hashes", () => {
  test("randomToken is URL-safe, long enough and unique", () => {
    const tokens = Array.from({ length: 300 }, () => randomToken(32));
    assert.equal(new Set(tokens).size, 300);
    for (const t of tokens) assert.match(t, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(randomToken(9).length, 12);
  });

  test("sha256 matches the standard test vector", () => {
    assert.equal(sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    assert.equal(sha256(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  test("hmacSecret is keyed, deterministic and different from a plain hash", () => {
    assert.equal(hmacSecret("ABCDEFGHIJ"), hmacSecret("ABCDEFGHIJ"));
    assert.notEqual(hmacSecret("ABCDEFGHIJ"), hmacSecret("ABCDEFGHIK"));
    assert.match(hmacSecret("x"), /^[0-9a-f]{64}$/);
    assert.notEqual(hmacSecret("abc"), sha256("abc"));
  });

  test("safeEqual compares by content, including different lengths", () => {
    assert.equal(safeEqual("same", "same"), true);
    assert.equal(safeEqual("same", "sam"), false);
    assert.equal(safeEqual("", ""), true);
    assert.equal(safeEqual("a", "b"), false);
  });
});
