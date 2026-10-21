import "server-only";
import { getDb, transaction } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { clearFailures, lockedFor, recordFailure } from "@/lib/login-throttle";

export type Role = "superadmin" | "member" | "viewer";
export const ROLES: Role[] = ["superadmin", "member", "viewer"];

export interface CurrentUser {
  id: number;
  email: string;
  name: string;
  role: Role;
}

export interface UserSummary extends CurrentUser {
  active: boolean;
  createdAt: number;
  lastLoginAt: number | null;
  instanceIds: number[];
}

export type UserErrorCode =
  | "email_taken"
  | "not_found"
  | "last_superadmin"
  | "self"
  | "setup_done"
  | "bad_instances"
  | "bad_password";

export class UserError extends Error {
  constructor(public code: UserErrorCode, message: string) {
    super(message);
    this.name = "UserError";
  }
}

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

interface UserRow {
  id: number;
  email: string;
  name: string;
  role: Role;
  active: number;
  password_hash: string;
  created_at: number;
  last_login_at: number | null;
  instance_ids?: string | null;
}

const toCurrent = (r: UserRow): CurrentUser => ({ id: r.id, email: r.email, name: r.name, role: r.role });

function isUnique(e: unknown): boolean {
  return e instanceof Error && /UNIQUE constraint failed/i.test(e.message);
}

export function countUsers(): number {
  return (getDb().prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
}

export function listUsers(): UserSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT u.*, group_concat(ui.instance_id) AS instance_ids
       FROM users u LEFT JOIN user_instances ui ON ui.user_id = u.id
       GROUP BY u.id ORDER BY u.created_at, u.id`,
    )
    .all() as unknown as UserRow[];
  return rows.map((r) => ({
    ...toCurrent(r),
    active: !!r.active,
    createdAt: r.created_at,
    lastLoginAt: r.last_login_at,
    instanceIds: r.instance_ids ? r.instance_ids.split(",").map(Number) : [],
  }));
}

function setInstances(userId: number, instanceIds: number[]): void {
  const db = getDb();
  const ids = [...new Set(instanceIds)];
  if (ids.length) {
    const found = db
      .prepare(`SELECT COUNT(*) AS n FROM instances WHERE id IN (${ids.map(() => "?").join(",")})`)
      .get(...ids) as { n: number };
    if (found.n !== ids.length) throw new UserError("bad_instances", "One or more instances do not exist.");
  }
  db.prepare("DELETE FROM user_instances WHERE user_id = ?").run(userId);
  const ins = db.prepare("INSERT INTO user_instances (user_id, instance_id) VALUES (?, ?)");
  for (const id of ids) ins.run(userId, id);
}

export interface NewUser {
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  instanceIds?: number[];
}

function insertUser(input: NewUser): number {
  const db = getDb();
  try {
    const { lastInsertRowid } = db
      .prepare(
        "INSERT INTO users (email, name, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
      )
      .run(input.email.trim(), input.name.trim(), input.passwordHash, input.role, Date.now());
    const id = Number(lastInsertRowid);
    if (input.role !== "superadmin") setInstances(id, input.instanceIds ?? []);
    return id;
  } catch (e) {
    if (isUnique(e)) throw new UserError("email_taken", "A user with that email already exists.");
    throw e;
  }
}

export function createUser(input: NewUser): number {
  return transaction(() => insertUser(input));
}

/** Atomic: only succeeds while the users table is empty, so two racing setups cannot both win. */
export function createFirstSuperadmin(input: Omit<NewUser, "role" | "instanceIds">): number {
  return transaction(() => {
    if (countUsers() > 0) throw new UserError("setup_done", "Setup has already been completed.");
    return insertUser({ ...input, role: "superadmin" });
  });
}

export interface UserPatch {
  name?: string;
  email?: string;
  role?: Role;
  active?: boolean;
  passwordHash?: string;
  instanceIds?: number[];
}

export function updateUser(id: number, patch: UserPatch, actingUserId: number): void {
  transaction((db) => {
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
    if (!row) throw new UserError("not_found", "User not found.");

    const role = patch.role ?? row.role;
    const active = patch.active ?? !!row.active;

    if (id === actingUserId && (role !== row.role || active !== !!row.active)) {
      throw new UserError("self", "You cannot change your own role or deactivate yourself.");
    }
    const wasActiveAdmin = row.role === "superadmin" && !!row.active;
    if (wasActiveAdmin && (role !== "superadmin" || !active) && otherActiveSuperadmins(id) === 0) {
      throw new UserError("last_superadmin", "There must be at least one active superadmin.");
    }

    try {
      db.prepare(
        "UPDATE users SET name = ?, email = ?, role = ?, active = ?, password_hash = ? WHERE id = ?",
      ).run(
        patch.name?.trim() ?? row.name,
        patch.email?.trim() ?? row.email,
        role,
        active ? 1 : 0,
        patch.passwordHash ?? row.password_hash,
        id,
      );
    } catch (e) {
      if (isUnique(e)) throw new UserError("email_taken", "A user with that email already exists.");
      throw e;
    }

    if (patch.instanceIds && role !== "superadmin") setInstances(id, patch.instanceIds);
    if (role === "superadmin") db.prepare("DELETE FROM user_instances WHERE user_id = ?").run(id);
    if (patch.passwordHash || !active) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  });
}

export function deleteUser(id: number, actingUserId: number): void {
  transaction((db) => {
    if (id === actingUserId) throw new UserError("self", "You cannot delete your own account.");
    const row = db.prepare("SELECT role, active FROM users WHERE id = ?").get(id) as
      | Pick<UserRow, "role" | "active">
      | undefined;
    if (!row) throw new UserError("not_found", "User not found.");
    if (row.role === "superadmin" && row.active && otherActiveSuperadmins(id) === 0) {
      throw new UserError("last_superadmin", "There must be at least one active superadmin.");
    }
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
  });
}

function otherActiveSuperadmins(excludingId: number): number {
  return (
    getDb()
      .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'superadmin' AND active = 1 AND id <> ?")
      .get(excludingId) as { n: number }
  ).n;
}

export type LoginResult =
  | { ok: true; user: CurrentUser }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked"; retryAfter: number };

export async function verifyLogin(email: string, password: string, ip: string | null): Promise<LoginResult> {
  const retryAfter = lockedFor(email, ip);
  if (retryAfter > 0) return { ok: false, reason: "locked", retryAfter };

  const row = getDb().prepare("SELECT * FROM users WHERE email = ?").get(email.trim()) as UserRow | undefined;
  const valid = await verifyPassword(password, row?.password_hash ?? null);
  if (!row || !valid || !row.active) {
    recordFailure(email, ip);
    return { ok: false, reason: "invalid" };
  }
  clearFailures(email);
  getDb().prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(Date.now(), row.id);
  return { ok: true, user: toCurrent(row) };
}

export async function changeOwnPassword(
  userId: number,
  current: string,
  next: string,
  keepSessionHash: string,
): Promise<void> {
  const row = getDb().prepare("SELECT password_hash FROM users WHERE id = ?").get(userId) as
    | { password_hash: string }
    | undefined;
  if (!row || !(await verifyPassword(current, row.password_hash))) {
    throw new UserError("bad_password", "Current password is incorrect.");
  }
  const hash = await hashPassword(next);
  transaction((db) => {
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, userId);
    // Other devices must re-authenticate with the new password.
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?").run(userId, keepSessionHash);
  });
}

export function updateOwnName(userId: number, name: string): void {
  getDb().prepare("UPDATE users SET name = ? WHERE id = ?").run(name.trim(), userId);
}
