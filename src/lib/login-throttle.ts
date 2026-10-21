import "server-only";
import { getDb } from "@/lib/db";

const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = { email: 5, ip: 25 } as const;
const MAX_ROWS = 10_000;

type Scope = keyof typeof MAX_FAILURES;
const keyOf = (scope: Scope, value: string) => `${scope}:${value.toLowerCase()}`;

/** Seconds until the key may try again, or 0 when it is free. `ip` is null unless a trusted proxy is declared. */
export function lockedFor(email: string, ip: string | null): number {
  const keys = [keyOf("email", email), ...(ip ? [keyOf("ip", ip)] : [])];
  const rows = getDb()
    .prepare(`SELECT locked_until FROM login_attempts WHERE key IN (${keys.map(() => "?").join(",")})`)
    .all(...keys) as Array<{ locked_until: number }>;
  const until = Math.max(0, ...rows.map((r) => r.locked_until));
  return until > Date.now() ? Math.ceil((until - Date.now()) / 1000) : 0;
}

export function recordFailure(email: string, ip: string | null): void {
  const db = getDb();
  const now = Date.now();
  // Expired rows are dead weight, and rotating emails would otherwise grow the table forever.
  db.prepare("DELETE FROM login_attempts WHERE window_start < ? AND locked_until < ?").run(now - WINDOW_MS, now);
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM login_attempts").get() as { n: number };
  if (n >= MAX_ROWS) {
    // Evict the oldest unlocked rows rather than refuse to record: refusing would let a flood of fake emails switch throttling off.
    db.prepare(
      "DELETE FROM login_attempts WHERE key IN (SELECT key FROM login_attempts WHERE locked_until < ? ORDER BY window_start LIMIT ?)",
    ).run(now, MAX_ROWS / 10);
  }
  const bump = db.prepare(`
    INSERT INTO login_attempts (key, failures, window_start, locked_until) VALUES (?, 1, ?, 0)
    ON CONFLICT(key) DO UPDATE SET
      failures     = CASE WHEN window_start < ? THEN 1 ELSE failures + 1 END,
      window_start = CASE WHEN window_start < ? THEN ? ELSE window_start END
    RETURNING failures
  `);
  for (const scope of ip ? (["email", "ip"] as const) : (["email"] as const)) {
    const key = keyOf(scope, scope === "email" ? email : ip!);
    const { failures } = bump.get(key, now, now - WINDOW_MS, now - WINDOW_MS, now) as { failures: number };
    if (failures >= MAX_FAILURES[scope]) {
      db.prepare("UPDATE login_attempts SET locked_until = ?, failures = 0 WHERE key = ?").run(now + LOCK_MS, key);
    }
  }
}

/** A good login clears the account counter only: the IP counter must not be resettable by a known account. */
export function clearFailures(email: string): void {
  getDb().prepare("DELETE FROM login_attempts WHERE key = ?").run(keyOf("email", email));
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
