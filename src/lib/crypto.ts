import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "@/lib/db";

// ── Secret key (encrypts instance tokens at rest) ─────────────────────────

let cachedKey: Buffer | undefined;

function secretKey(): Buffer {
  if (cachedKey) return cachedKey;
  const fromEnv = process.env.GLITCHLENS_SECRET;
  if (fromEnv) {
    if (fromEnv.length < 32) throw new Error("GLITCHLENS_SECRET must be at least 32 characters");
    return (cachedKey = scryptSync(fromEnv, "glitchlens:secret:v1", 32));
  }
  const file = path.join(dataDir(), "secret.key");
  if (!existsSync(file)) {
    // 'wx' fails if another process created it first; we then read theirs.
    try {
      writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600, flag: "wx" });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
  }
  chmodSync(file, 0o600);
  return (cachedKey = Buffer.from(readFileSync(file, "utf8").trim(), "hex"));
}

/** AES-256-GCM. Output: iv.tag.ciphertext (base64url, dot separated). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

/** Returns null when the payload is malformed or the key changed. */
export function decryptSecret(payload: string): string | null {
  try {
    const [iv, tag, data] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", secretKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ── Passwords ──────────────────────────────────────────────────────────────

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 64, maxmem: 128 * 1024 * 1024 };

function scryptAsync(password: string, salt: Buffer, p: typeof SCRYPT): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, p.keylen, { N: p.N, r: p.r, p: p.p, maxmem: p.maxmem }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

let dummyHash: Promise<string> | undefined;

/** Constant-ish time: when the user does not exist we still burn one scrypt. */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const hash = stored ?? (await (dummyHash ??= hashPassword(randomBytes(12).toString("hex"))));
  const [alg, N, r, p, salt, key] = hash.split("$");
  if (alg !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64url");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64url"), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    keylen: expected.length,
    maxmem: SCRYPT.maxmem,
  });
  return stored !== null && timingSafeEqual(actual, expected);
}

// ── Tokens ─────────────────────────────────────────────────────────────────

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Keyed hash for values that must be comparable but never readable (recovery codes). Depends on the server key. */
export function hmacSecret(value: string): string {
  return createHmac("sha256", secretKey()).update(value).digest("hex");
}
