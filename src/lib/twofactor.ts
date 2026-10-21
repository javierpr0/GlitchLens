import "server-only";
import { renderSVG } from "uqr";
import { getDb, transaction } from "@/lib/db";
import { decryptSecret, encryptSecret, hmacSecret, randomToken, sha256 } from "@/lib/crypto";
import {
  generateRecoveryCode,
  generateTotpSecret,
  matchTotp,
  normalizeRecoveryCode,
  otpauthUri,
} from "@/lib/totp";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_CHALLENGE_ATTEMPTS = 5;
const RECOVERY_CODES = 10;

export type SecondFactorResult = "ok" | "invalid" | "unreadable";

interface TwoFactorRow {
  totp_secret_enc: string | null;
  totp_enabled: number;
  totp_last_step: number;
}

function row(userId: number): TwoFactorRow | undefined {
  return getDb()
    .prepare("SELECT totp_secret_enc, totp_enabled, totp_last_step FROM users WHERE id = ?")
    .get(userId) as TwoFactorRow | undefined;
}

export function isTwoFactorEnabled(userId: number): boolean {
  return !!row(userId)?.totp_enabled;
}

export function recoveryCodesLeft(userId: number): number {
  return (
    getDb().prepare("SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL").get(userId) as {
      n: number;
    }
  ).n;
}

function newRecoveryCodes(userId: number): string[] {
  const db = getDb();
  const codes = Array.from({ length: RECOVERY_CODES }, generateRecoveryCode);
  db.prepare("DELETE FROM recovery_codes WHERE user_id = ?").run(userId);
  const ins = db.prepare("INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)");
  for (const c of codes) ins.run(userId, hmacSecret(normalizeRecoveryCode(c)));
  return codes;
}

/** Starts (or restarts) enrolment. Nothing is enforced until confirmSetup succeeds. */
export function beginSetup(userId: number, accountEmail: string): { secret: string; uri: string; qr: string } | null {
  const state = row(userId);
  if (!state || state.totp_enabled) return null;
  const secret = generateTotpSecret();
  transaction((db) => {
    db.prepare("UPDATE users SET totp_secret_enc = ?, totp_last_step = 0 WHERE id = ?").run(encryptSecret(secret), userId);
    db.prepare("DELETE FROM recovery_codes WHERE user_id = ?").run(userId);
  });
  const uri = otpauthUri(secret, accountEmail);
  // An <img> data URL, not inline markup: the page never injects raw HTML.
  const qr = `data:image/svg+xml;base64,${Buffer.from(renderSVG(uri, { border: 2 })).toString("base64")}`;
  return { secret, uri, qr };
}

/** Confirms enrolment with a first valid code. Returns the recovery codes, shown once. */
export function confirmSetup(userId: number, code: string, keepSessionHash: string | null): string[] | null {
  const state = row(userId);
  if (!state || state.totp_enabled || !state.totp_secret_enc) return null;
  const secret = decryptSecret(state.totp_secret_enc);
  const step = secret ? matchTotp(secret, code.replace(/\s/g, "")) : null;
  if (step === null) return null;
  return transaction((db) => {
    // The code that confirms enrolment must not be reusable for the next login.
    db.prepare("UPDATE users SET totp_enabled = 1, totp_last_step = ? WHERE id = ?").run(step, userId);
    // A session stolen before 2FA existed must not survive turning it on.
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?").run(userId, keepSessionHash ?? "");
    return newRecoveryCodes(userId);
  });
}

/**
 * Checks a TOTP code or a recovery code for an account with 2FA on.
 * "unreadable" means 2FA is enabled but its secret cannot be decrypted (key changed): the caller must deny.
 */
export function verifySecondFactor(userId: number, input: string): SecondFactorResult {
  const state = row(userId);
  if (!state || !state.totp_enabled || !state.totp_secret_enc) return "invalid";
  const secret = decryptSecret(state.totp_secret_enc);
  if (!secret) return "unreadable";

  const code = input.replace(/[\s-]/g, "");
  if (/^\d{6}$/.test(code)) {
    const step = matchTotp(secret, code);
    if (step === null) return "invalid";
    // Atomic: only a step newer than the last accepted one wins, so a code works exactly once.
    const { changes } = getDb()
      .prepare("UPDATE users SET totp_last_step = ? WHERE id = ? AND totp_last_step < ?")
      .run(step, userId, step);
    return changes === 1 ? "ok" : "invalid";
  }

  const normalized = normalizeRecoveryCode(input);
  if (normalized.length !== 10) return "invalid";
  const { changes } = getDb()
    .prepare("UPDATE recovery_codes SET used_at = ? WHERE user_id = ? AND code_hash = ? AND used_at IS NULL")
    .run(Date.now(), userId, hmacSecret(normalized));
  return changes === 1 ? "ok" : "invalid";
}

export function isRecoveryCodeInput(input: string): boolean {
  return !/^\d{6}$/.test(input.replace(/[\s-]/g, ""));
}

export function disableTwoFactor(userId: number): void {
  transaction((db) => {
    db.prepare("UPDATE users SET totp_secret_enc = NULL, totp_enabled = 0, totp_last_step = 0 WHERE id = ?").run(userId);
    db.prepare("DELETE FROM recovery_codes WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM login_challenges WHERE user_id = ?").run(userId);
  });
}

/** Admin reset for a lost device. Also ends every session: whoever held the old factor loses access. */
export function resetTwoFactor(userId: number): void {
  disableTwoFactor(userId);
  getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export function regenerateRecoveryCodes(userId: number): string[] | null {
  if (!isTwoFactorEnabled(userId)) return null;
  return transaction(() => newRecoveryCodes(userId));
}

// ── Login challenge (between the password step and the code step) ──────────

export function createChallenge(userId: number): string {
  const db = getDb();
  const token = randomToken(32);
  db.prepare("DELETE FROM login_challenges WHERE expires_at <= ?").run(Date.now());
  db.prepare("INSERT INTO login_challenges (token_hash, user_id, expires_at, attempts) VALUES (?, ?, ?, 0)").run(
    sha256(token),
    userId,
    Date.now() + CHALLENGE_TTL_MS,
  );
  return token;
}

/** Looks a challenge up without consuming it. Counts the attempt up front so a crash cannot grant a free guess. */
export function takeChallengeAttempt(token: string): number | null {
  const db = getDb();
  const hash = sha256(token);
  const found = db
    .prepare("SELECT user_id, attempts FROM login_challenges WHERE token_hash = ? AND expires_at > ?")
    .get(hash, Date.now()) as { user_id: number; attempts: number } | undefined;
  if (!found) return null;
  if (found.attempts + 1 >= MAX_CHALLENGE_ATTEMPTS) db.prepare("DELETE FROM login_challenges WHERE token_hash = ?").run(hash);
  else db.prepare("UPDATE login_challenges SET attempts = attempts + 1 WHERE token_hash = ?").run(hash);
  return found.user_id;
}

export function consumeChallenge(token: string): void {
  getDb().prepare("DELETE FROM login_challenges WHERE token_hash = ?").run(sha256(token));
}
