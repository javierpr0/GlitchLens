import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, test } from "node:test";
import {
  base32Decode,
  base32Encode,
  currentStep,
  generateRecoveryCode,
  generateTotpSecret,
  matchTotp,
  normalizeRecoveryCode,
  otpauthUri,
  totpAt,
} from "@/lib/totp";

// RFC 6238, appendix B: SHA-1, secret "12345678901234567890". The RFC lists 8-digit codes; ours are the last 6.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));
const RFC_VECTORS: Array<[number, string]> = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
  [20000000000, "65353130"],
];

describe("TOTP against the RFC 6238 test vectors", () => {
  for (const [unix, expected] of RFC_VECTORS) {
    test(`t=${unix}`, () => {
      assert.equal(totpAt(RFC_SECRET, Math.floor(unix / 30)), expected.slice(-6));
    });
  }
});

describe("base32", () => {
  test("encodes the RFC 4648 examples without padding", () => {
    assert.equal(base32Encode(Buffer.from("f")), "MY");
    assert.equal(base32Encode(Buffer.from("fo")), "MZXQ");
    assert.equal(base32Encode(Buffer.from("foobar")), "MZXW6YTBOI");
  });

  test("round-trips random buffers of every length", () => {
    for (let len = 0; len <= 40; len++) {
      const buf = randomBytes(len);
      assert.deepEqual(base32Decode(base32Encode(buf)), buf);
    }
  });

  test("decoding is case-insensitive and tolerates padding", () => {
    assert.deepEqual(base32Decode("mzxw6ytboi======"), Buffer.from("foobar"));
  });

  test("rejects characters outside the alphabet", () => {
    for (const bad of ["MZXW1", "MZXW0", "MZXW8", "MZXW9", "MZ XW", "MZ-XW"]) {
      assert.throws(() => base32Decode(bad), /invalid base32/, bad);
    }
  });
});

describe("secret generation", () => {
  test("is 20 random bytes as 32 base32 characters", () => {
    const secret = generateTotpSecret();
    assert.match(secret, /^[A-Z2-7]{32}$/);
    assert.equal(base32Decode(secret).length, 20);
  });

  test("never repeats", () => {
    const seen = new Set(Array.from({ length: 500 }, generateTotpSecret));
    assert.equal(seen.size, 500);
  });
});

describe("matchTotp", () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 10);
  const step = currentStep(now);

  test("accepts the current code and returns its step", () => {
    assert.equal(matchTotp(RFC_SECRET, totpAt(RFC_SECRET, step), now), step);
  });

  test("accepts one step of clock drift either way", () => {
    assert.equal(matchTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 1), now), step - 1);
    assert.equal(matchTotp(RFC_SECRET, totpAt(RFC_SECRET, step + 1), now), step + 1);
  });

  test("rejects two steps of drift", () => {
    assert.equal(matchTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 2), now), null);
    assert.equal(matchTotp(RFC_SECRET, totpAt(RFC_SECRET, step + 2), now), null);
  });

  test("rejects anything that is not exactly six digits", () => {
    const good = totpAt(RFC_SECRET, step);
    for (const bad of ["", "12345", "1234567", "12345a", " 123456", "123 456", "१२३४५६", good + "0"]) {
      assert.equal(matchTotp(RFC_SECRET, bad, now), null, JSON.stringify(bad));
    }
  });

  test("a code for another secret does not match", () => {
    const other = "JBSWY3DPEHPK3PXP";
    const foreign = totpAt(other, step);
    assert.notEqual(foreign, totpAt(RFC_SECRET, step), "fixture sanity: the two secrets must disagree at this step");
    assert.equal(matchTotp(RFC_SECRET, foreign, now), null);
  });
});

describe("otpauthUri", () => {
  test("carries the secret, issuer and the parameters apps assume", () => {
    const uri = new URL(otpauthUri("ABCDEFGH", "user@example.com"));
    assert.equal(uri.protocol, "otpauth:");
    assert.equal(uri.host, "totp");
    assert.equal(decodeURIComponent(uri.pathname.slice(1)), "GlitchLens:user@example.com");
    assert.equal(uri.searchParams.get("secret"), "ABCDEFGH");
    assert.equal(uri.searchParams.get("issuer"), "GlitchLens");
    assert.equal(uri.searchParams.get("algorithm"), "SHA1");
    assert.equal(uri.searchParams.get("digits"), "6");
    assert.equal(uri.searchParams.get("period"), "30");
  });

  test("encodes account names that would break the URI", () => {
    const uri = otpauthUri("ABCDEFGH", "a b+c&d=e#f@example.com", "My Co");
    const parsed = new URL(uri);
    assert.equal(decodeURIComponent(parsed.pathname.slice(1)), "My Co:a b+c&d=e#f@example.com");
    assert.equal(parsed.searchParams.get("issuer"), "My Co");
    assert.equal([...parsed.searchParams.keys()].length, 5);
  });
});

describe("recovery codes", () => {
  test("look like XXXXX-XXXXX over the base32 alphabet", () => {
    for (let i = 0; i < 200; i++) assert.match(generateRecoveryCode(), /^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
  });

  test("do not repeat", () => {
    assert.equal(new Set(Array.from({ length: 2000 }, generateRecoveryCode)).size, 2000);
  });

  test("normalise by dropping case, dashes, spaces and look-alike digits", () => {
    assert.equal(normalizeRecoveryCode("abcde-fgh23"), "ABCDEFGH23");
    assert.equal(normalizeRecoveryCode(" AB CD-EF GH-23 "), "ABCDEFGH23");
    assert.equal(normalizeRecoveryCode("A0B1C8D9"), "ABCD");
    assert.equal(normalizeRecoveryCode(""), "");
  });
});
