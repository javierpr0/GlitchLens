import "server-only";
import { getDb } from "@/lib/db";
import { pruneAudit } from "@/lib/audit";
import { randomToken, safeEqual, sha256, hashPassword } from "@/lib/crypto";
import { PASSWORD_MAX, PASSWORD_MIN, UserError, countUsers, createFirstSuperadmin } from "@/lib/users";

const SETUP_KEY = "setup_code_hash";

/** Runs once per server start: migrates the DB and prepares the first superadmin. */
export async function bootstrap(): Promise<void> {
  const db = getDb();
  pruneAudit();

  if (countUsers() > 0) {
    db.prepare("DELETE FROM settings WHERE key = ?").run(SETUP_KEY);
    return;
  }

  const email = process.env.GLITCHLENS_ADMIN_EMAIL?.trim();
  const password = process.env.GLITCHLENS_ADMIN_PASSWORD;
  if (email && password) {
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
      console.error(`[glitchlens] GLITCHLENS_ADMIN_PASSWORD must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters. Falling back to the setup page.`);
    } else {
      try {
        createFirstSuperadmin({ email, name: "Admin", passwordHash: await hashPassword(password) });
        console.log(`[glitchlens] Superadmin ${email} created from environment variables.`);
        return;
      } catch (e) {
        if (!(e instanceof UserError)) throw e;
        return;
      }
    }
  }

  const envCode = process.env.GLITCHLENS_SETUP_CODE;
  const code = envCode || randomToken(9);
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(SETUP_KEY, sha256(code));

  const bar = "=".repeat(64);
  console.log(
    [
      "",
      bar,
      " GlitchLens setup",
      " No users exist yet. Open /setup in your browser to create the superadmin.",
      envCode ? " Setup code: the value of GLITCHLENS_SETUP_CODE" : ` Setup code: ${code}`,
      bar,
      "",
    ].join("\n"),
  );
}

export function verifySetupCode(input: string): boolean {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(SETUP_KEY) as
    | { value: string }
    | undefined;
  if (!row) return false;
  return safeEqual(sha256(input.trim()), row.value);
}

export function setupPending(): boolean {
  return countUsers() === 0;
}

export function clearSetupCode(): void {
  getDb().prepare("DELETE FROM settings WHERE key = ?").run(SETUP_KEY);
}
