import "server-only";
import { getDb } from "@/lib/db";

const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = { email: 5, ip: 25 } as const;
const MAX_MEMORY_KEYS = 10_000;

type Scope = keyof typeof MAX_FAILURES;
const keyOf = (scope: Scope, value: string) => `${scope}:${value.toLowerCase()}`;

interface Counter {
  failures: number;
  windowStart: number;
  lockedUntil: number;
}

/**
 * Counters for things an attacker can mint for free (made-up emails, IPs) live in a
 * bounded in-memory map. Only real accounts are stored in the database, so their
 * counters can never be evicted by a flood of fake keys.
 */
const memory = ((globalThis as { __glitchlensThrottle?: Map<string, Counter> }).__glitchlensThrottle ??= new Map());

function bumpMemory(key: string, max: number, now: number): void {
  let c = memory.get(key);
  if (!c) {
    if (memory.size >= MAX_MEMORY_KEYS) memory.delete(memory.keys().next().value!);
    c = { failures: 0, windowStart: now, lockedUntil: 0 };
    memory.set(key, c);
  }
  if (c.windowStart < now - WINDOW_MS) {
    c.failures = 0;
    c.windowStart = now;
  }
  if (++c.failures >= max) {
    c.lockedUntil = now + LOCK_MS;
    c.failures = 0;
  }
}

/** Seconds until the key may try again, or 0 when it is free. `ip` is null unless a trusted proxy is declared. */
export function lockedFor(email: string, ip: string | null): number {
  const now = Date.now();
  const emailKey = keyOf("email", email);
  const row = getDb().prepare("SELECT locked_until FROM login_attempts WHERE key = ?").get(emailKey) as
    | { locked_until: number }
    | undefined;
  const until = Math.max(
    row?.locked_until ?? 0,
    memory.get(emailKey)?.lockedUntil ?? 0,
    ip ? (memory.get(keyOf("ip", ip))?.lockedUntil ?? 0) : 0,
  );
  return until > now ? Math.ceil((until - now) / 1000) : 0;
}

/** `accountExists` decides where the email counter lives, but the caller sees the same behaviour either way. */
export function recordFailure(email: string, ip: string | null, accountExists: boolean): void {
  const now = Date.now();
  const emailKey = keyOf("email", email);

  if (accountExists) {
    const db = getDb();
    db.prepare("DELETE FROM login_attempts WHERE window_start < ? AND locked_until < ?").run(now - WINDOW_MS, now);
    const { failures } = db
      .prepare(
        `INSERT INTO login_attempts (key, failures, window_start, locked_until) VALUES (?, 1, ?, 0)
         ON CONFLICT(key) DO UPDATE SET
           failures     = CASE WHEN window_start < ? THEN 1 ELSE failures + 1 END,
           window_start = CASE WHEN window_start < ? THEN ? ELSE window_start END
         RETURNING failures`,
      )
      .get(emailKey, now, now - WINDOW_MS, now - WINDOW_MS, now) as { failures: number };
    if (failures >= MAX_FAILURES.email) {
      db.prepare("UPDATE login_attempts SET locked_until = ?, failures = 0 WHERE key = ?").run(now + LOCK_MS, emailKey);
    }
  } else {
    bumpMemory(emailKey, MAX_FAILURES.email, now);
  }
  if (ip) bumpMemory(keyOf("ip", ip), MAX_FAILURES.ip, now);
}

/** A good login clears the account counter only: the IP counter must not be resettable by a known account. */
export function clearFailures(email: string): void {
  getDb().prepare("DELETE FROM login_attempts WHERE key = ?").run(keyOf("email", email));
  memory.delete(keyOf("email", email));
}

/**
 * The source IP is only usable behind a proxy we trust: X-Forwarded-For is
 * client-controlled, so without GLITCHLENS_TRUST_PROXY=true we do not throttle
 * by IP at all (otherwise one shared "unknown" key would let anyone lock everybody out).
 * With one trusted proxy, the last entry is the address that proxy saw.
 */
export function clientIp(headers: Headers): string | null {
  if (process.env.GLITCHLENS_TRUST_PROXY !== "true") return null;
  const forwarded = headers.get("x-forwarded-for")?.split(",").map((p) => p.trim()).filter(Boolean);
  return forwarded?.at(-1) || headers.get("x-real-ip")?.trim() || null;
}
