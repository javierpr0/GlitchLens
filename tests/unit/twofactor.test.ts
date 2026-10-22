import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { createSession } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import {
  beginSetup,
  confirmSetup,
  consumeChallenge,
  createChallenge,
  disableTwoFactor,
  isRecoveryCodeInput,
  isTwoFactorEnabled,
  recoveryCodesLeft,
  regenerateRecoveryCodes,
  resetTwoFactor,
  takeChallengeAttempt,
  verifySecondFactor,
} from "@/lib/twofactor";
import { createUser } from "@/lib/users";
import { totpCode, withTempDataDir } from "./helpers.ts";

withTempDataDir();

afterEach(() => getDb().exec("DELETE FROM users"));

let seq = 0;
const mk = () => {
  const email = `u${++seq}@x.com`;
  return { id: createUser({ email, name: "U", role: "member", passwordHash: "h" }), email };
};
const enrol = () => {
  const u = mk();
  const setup = beginSetup(u.id, u.email)!;
  const codes = confirmSetup(u.id, totpCode(setup.secret), null)!;
  return { ...u, secret: setup.secret, codes };
};
const freeStep = () => getDb().exec("UPDATE users SET totp_last_step = 0");

describe("enrolment", () => {
  test("beginSetup returns a secret, an otpauth URI and a QR as an <img>-safe data URL", () => {
    const u = mk();
    const s = beginSetup(u.id, u.email)!;
    assert.match(s.secret, /^[A-Z2-7]{32}$/);
    assert.ok(s.uri.startsWith("otpauth://totp/") && s.uri.includes(s.secret));
    assert.match(s.qr, /^data:image\/svg\+xml;base64,/);
    const svg = Buffer.from(s.qr.split(",")[1], "base64").toString();
    assert.ok(svg.startsWith("<svg") || svg.includes("<svg"), "it is an SVG");
    assert.equal(isTwoFactorEnabled(u.id), false, "nothing is enforced yet");
  });

  test("the secret is stored encrypted", () => {
    const u = mk();
    const { secret } = beginSetup(u.id, u.email)!;
    const stored = getDb().prepare("SELECT totp_secret_enc AS v FROM users WHERE id = ?").get(u.id)!.v as string;
    assert.ok(!stored.includes(secret));
  });

  test("starting again replaces the pending secret and old codes become useless", () => {
    const u = mk();
    const first = beginSetup(u.id, u.email)!;
    const second = beginSetup(u.id, u.email)!;
    assert.notEqual(first.secret, second.secret);
    assert.equal(confirmSetup(u.id, totpCode(first.secret), null), null, "the old secret no longer works");
    assert.ok(confirmSetup(u.id, totpCode(second.secret), null));
  });

  test("a wrong code does not enable anything, an unknown user gets nothing", () => {
    const u = mk();
    beginSetup(u.id, u.email);
    for (const bad of ["000000", "", "abcdef", "12345"]) assert.equal(confirmSetup(u.id, bad, null), null, bad);
    assert.equal(isTwoFactorEnabled(u.id), false);
    assert.equal(beginSetup(999999, "x@x.com"), null);
    assert.equal(confirmSetup(999999, "123456", null), null);
  });

  test("confirming without ever starting is refused", () => {
    const u = mk();
    assert.equal(confirmSetup(u.id, "123456", null), null);
  });

  test("a good code enables 2FA and hands out ten distinct recovery codes, once", () => {
    const u = mk();
    const { secret } = beginSetup(u.id, u.email)!;
    const codes = confirmSetup(u.id, totpCode(secret), null)!;
    assert.equal(isTwoFactorEnabled(u.id), true);
    assert.equal(codes.length, 10);
    assert.equal(new Set(codes).size, 10);
    assert.equal(recoveryCodesLeft(u.id), 10);
    const stored = (getDb().prepare("SELECT code_hash FROM recovery_codes").all() as Array<{ code_hash: string }>).map((r) => r.code_hash);
    for (const c of codes) assert.ok(!stored.includes(c) && !stored.includes(c.replace("-", "")), "never stored in clear");
  });

  test("enrolling ends the user's other sessions but not the one that did it", () => {
    const u = mk();
    const keep = createSession(u.id);
    createSession(u.id);
    createSession(u.id);
    const { secret } = beginSetup(u.id, u.email)!;
    confirmSetup(u.id, totpCode(secret), sha256(keep.token));
    const left = (getDb().prepare("SELECT token_hash FROM sessions WHERE user_id = ?").all(u.id) as Array<{ token_hash: string }>).map((r) => r.token_hash);
    assert.deepEqual(left, [sha256(keep.token)]);
  });

  test("the code that confirmed enrolment cannot be reused to log in", () => {
    const u = mk();
    const { secret } = beginSetup(u.id, u.email)!;
    const code = totpCode(secret);
    confirmSetup(u.id, code, null);
    assert.equal(verifySecondFactor(u.id, code), "invalid");
  });

  test("setup cannot be restarted while 2FA is on", () => {
    const e = enrol();
    assert.equal(beginSetup(e.id, e.email), null);
    assert.equal(isTwoFactorEnabled(e.id), true);
  });
});

describe("verifySecondFactor with a TOTP code", () => {
  test("accepts a current-window code once, and refuses its replay", () => {
    const e = enrol();
    freeStep();
    const code = totpCode(e.secret, 1);
    assert.equal(verifySecondFactor(e.id, code), "ok");
    assert.equal(verifySecondFactor(e.id, code), "invalid", "same code, same step");
  });

  test("refuses an older step than the last one accepted", () => {
    const e = enrol();
    freeStep();
    assert.equal(verifySecondFactor(e.id, totpCode(e.secret, 1)), "ok");
    assert.equal(verifySecondFactor(e.id, totpCode(e.secret, 0)), "invalid", "going back in time is not allowed");
  });

  test("allows one step of clock drift, not two", () => {
    const e = enrol();
    freeStep();
    assert.equal(verifySecondFactor(e.id, totpCode(e.secret, -1)), "ok");
    freeStep();
    assert.equal(verifySecondFactor(e.id, totpCode(e.secret, 2)), "invalid");
    assert.equal(verifySecondFactor(e.id, totpCode(e.secret, -2)), "invalid");
  });

  test("tolerates spaces and a dash as people type them", () => {
    const e = enrol();
    freeStep();
    const code = totpCode(e.secret, 1);
    assert.equal(verifySecondFactor(e.id, `${code.slice(0, 3)} ${code.slice(3)}`), "ok");
  });

  test("refuses wrong codes and accounts without 2FA", () => {
    const e = enrol();
    for (const bad of ["000000", "999999", "", "12345", "1234567", "abcdef"]) assert.equal(verifySecondFactor(e.id, bad), "invalid", bad);
    assert.equal(verifySecondFactor(mk().id, "123456"), "invalid");
    assert.equal(verifySecondFactor(424242, "123456"), "invalid");
  });

  test("a code for somebody else's secret is refused", () => {
    const a = enrol();
    const b = enrol();
    freeStep();
    assert.equal(verifySecondFactor(a.id, totpCode(b.secret, 1)), "invalid");
  });
});

describe("recovery codes", () => {
  test("each works exactly once, in any case and with or without the dash", () => {
    const e = enrol();
    assert.equal(verifySecondFactor(e.id, e.codes[0].toLowerCase()), "ok");
    assert.equal(verifySecondFactor(e.id, e.codes[0]), "invalid");
    assert.equal(verifySecondFactor(e.id, e.codes[1].replace("-", "")), "ok");
    assert.equal(verifySecondFactor(e.id, ` ${e.codes[2]} `), "ok");
    assert.equal(recoveryCodesLeft(e.id), 7);
  });

  test("a recovery code from another account does not work", () => {
    const a = enrol();
    const b = enrol();
    assert.equal(verifySecondFactor(a.id, b.codes[0]), "invalid");
    assert.equal(recoveryCodesLeft(b.id), 10);
  });

  test("near-misses are refused", () => {
    const e = enrol();
    for (const bad of [e.codes[0].slice(0, -1), e.codes[0] + "A", "AAAAA-AAAAA", "00000-00000", "ZZZZZZZ"]) {
      assert.equal(verifySecondFactor(e.id, bad), "invalid", bad);
    }
  });

  test("regenerating replaces the whole set", () => {
    const e = enrol();
    const fresh = regenerateRecoveryCodes(e.id)!;
    assert.equal(fresh.length, 10);
    assert.equal(recoveryCodesLeft(e.id), 10);
    assert.equal(verifySecondFactor(e.id, e.codes[0]), "invalid", "the old set is gone");
    assert.equal(verifySecondFactor(e.id, fresh[0]), "ok");
  });

  test("regenerating needs 2FA to be on", () => {
    assert.equal(regenerateRecoveryCodes(mk().id), null);
  });

  test("isRecoveryCodeInput tells a TOTP code from a recovery code", () => {
    assert.equal(isRecoveryCodeInput("123456"), false);
    assert.equal(isRecoveryCodeInput("123 456"), false);
    assert.equal(isRecoveryCodeInput("ABCDE-FGH23"), true);
    assert.equal(isRecoveryCodeInput("12345"), true);
  });
});

describe("an unreadable secret never lets anyone through", () => {
  test("TOTP and recovery codes are both refused as 'unreadable'", () => {
    const e = enrol();
    getDb().prepare("UPDATE users SET totp_secret_enc = 'garbage' WHERE id = ?").run(e.id);
    freeStep();
    assert.equal(verifySecondFactor(e.id, totpCode(e.secret, 1)), "unreadable");
    assert.equal(verifySecondFactor(e.id, e.codes[0]), "unreadable");
    assert.equal(isTwoFactorEnabled(e.id), true, "and 2FA is still considered on");
  });
});

describe("turning it off", () => {
  test("disableTwoFactor clears everything including half-finished logins", () => {
    const e = enrol();
    createChallenge(e.id);
    disableTwoFactor(e.id);
    assert.equal(isTwoFactorEnabled(e.id), false);
    assert.equal(recoveryCodesLeft(e.id), 0);
    assert.equal((getDb().prepare("SELECT COUNT(*) AS n FROM login_challenges").get() as { n: number }).n, 0);
    assert.equal(getDb().prepare("SELECT totp_secret_enc AS v FROM users WHERE id = ?").get(e.id)!.v, null);
    assert.equal(verifySecondFactor(e.id, e.codes[0]), "invalid");
  });

  test("resetTwoFactor (the admin path) also ends every session", () => {
    const e = enrol();
    createSession(e.id);
    createSession(e.id);
    resetTwoFactor(e.id);
    assert.equal(isTwoFactorEnabled(e.id), false);
    assert.equal((getDb().prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?").get(e.id) as { n: number }).n, 0);
  });

  test("after a reset the user can enrol again from scratch", () => {
    const e = enrol();
    resetTwoFactor(e.id);
    const again = beginSetup(e.id, e.email)!;
    assert.ok(confirmSetup(e.id, totpCode(again.secret), null));
  });
});

describe("login challenges", () => {
  test("a challenge maps back to its user and is stored only as a hash", () => {
    const u = mk();
    const token = createChallenge(u.id);
    assert.equal(takeChallengeAttempt(token), u.id);
    const stored = (getDb().prepare("SELECT token_hash FROM login_challenges").all() as Array<{ token_hash: string }>).map((r) => r.token_hash);
    assert.deepEqual(stored, [sha256(token)]);
  });

  test("unknown, empty and forged tokens give nothing", () => {
    for (const t of ["", "nope", "x".repeat(43)]) assert.equal(takeChallengeAttempt(t), null, t);
  });

  test("an expired challenge is refused", () => {
    const u = mk();
    const token = createChallenge(u.id);
    getDb().prepare("UPDATE login_challenges SET expires_at = ?").run(Date.now() - 1);
    assert.equal(takeChallengeAttempt(token), null);
  });

  test("allows five attempts and the fifth burns the challenge", () => {
    const u = mk();
    const token = createChallenge(u.id);
    for (let i = 1; i <= 5; i++) assert.equal(takeChallengeAttempt(token), u.id, `attempt ${i}`);
    assert.equal(takeChallengeAttempt(token), null, "a sixth is refused");
  });

  test("consumeChallenge ends it right away", () => {
    const u = mk();
    const token = createChallenge(u.id);
    consumeChallenge(token);
    assert.equal(takeChallengeAttempt(token), null);
  });

  test("creating one sweeps out expired ones", () => {
    const u = mk();
    const old = createChallenge(u.id);
    getDb().prepare("UPDATE login_challenges SET expires_at = 1").run();
    createChallenge(u.id);
    assert.equal((getDb().prepare("SELECT COUNT(*) AS n FROM login_challenges").get() as { n: number }).n, 1);
    assert.equal(takeChallengeAttempt(old), null);
  });

  test("two users' challenges do not mix", () => {
    const [a, b] = [mk(), mk()];
    const ta = createChallenge(a.id);
    const tb = createChallenge(b.id);
    assert.equal(takeChallengeAttempt(ta), a.id);
    assert.equal(takeChallengeAttempt(tb), b.id);
  });
});
