import "server-only";
import { getDb } from "@/lib/db";
import type { Role } from "@/lib/users";

export type TwoFactorPolicy = "off" | "superadmins" | "all";
export const TWO_FACTOR_POLICIES: TwoFactorPolicy[] = ["off", "superadmins", "all"];

const KEY = "require_2fa";

export function getTwoFactorPolicy(): TwoFactorPolicy {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(KEY) as { value: string } | undefined;
  return TWO_FACTOR_POLICIES.includes(row?.value as TwoFactorPolicy) ? (row!.value as TwoFactorPolicy) : "off";
}

export function setTwoFactorPolicy(policy: TwoFactorPolicy): void {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(KEY, policy);
}

/** True when the policy covers this role but the account has not enrolled yet. */
export function mustEnrollTwoFactor(role: Role, hasTwoFactor: boolean, policy: TwoFactorPolicy): boolean {
  if (hasTwoFactor || policy === "off") return false;
  return policy === "all" || role === "superadmin";
}
