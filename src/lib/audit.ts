import "server-only";
import { getDb } from "@/lib/db";
import { clientIp } from "@/lib/login-throttle";
import type { CurrentUser } from "@/lib/users";

const RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

export interface AuditEntry {
  id: number;
  at: number;
  actorEmail: string | null;
  action: string;
  target: string | null;
  detail: string | null;
  ip: string | null;
}

interface AuditInput {
  actor: Pick<CurrentUser, "id" | "email"> | null;
  /** Used when there is no signed-in actor (for example a lockout). Attacker-controlled: stored and shown as plain text. */
  actorEmail?: string;
  action: string;
  target?: string;
  /** Names and non-secret values only. Never passwords or tokens. */
  detail?: Record<string, unknown>;
  headers?: Headers;
}

/** Best effort: failing to write the log must not break the action being logged. */
export function recordAudit(e: AuditInput): void {
  try {
    getDb()
      .prepare("INSERT INTO audit_log (at, actor_id, actor_email, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(
        Date.now(),
        e.actor?.id ?? null,
        (e.actor?.email ?? e.actorEmail ?? null)?.slice(0, 254) ?? null,
        e.action,
        e.target?.slice(0, 300) ?? null,
        e.detail ? JSON.stringify(e.detail).slice(0, 500) : null,
        e.headers ? clientIp(e.headers) : null,
      );
  } catch (err) {
    console.error("[glitchlens] could not write audit log:", err instanceof Error ? err.message : "unknown");
  }
}

/** Newest first. Pass the last id you saw as `before` to get the next page. */
export function listAudit(before?: number, limit = 100): AuditEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT id, at, actor_email, action, target, detail, ip FROM audit_log
       WHERE (? IS NULL OR id < ?) ORDER BY id DESC LIMIT ?`,
    )
    .all(before ?? null, before ?? null, limit) as unknown as Array<{
    id: number;
    at: number;
    actor_email: string | null;
    action: string;
    target: string | null;
    detail: string | null;
    ip: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    actorEmail: r.actor_email,
    action: r.action,
    target: r.target,
    detail: r.detail,
    ip: r.ip,
  }));
}

export function pruneAudit(): void {
  getDb().prepare("DELETE FROM audit_log WHERE at < ?").run(Date.now() - RETENTION_MS);
}
