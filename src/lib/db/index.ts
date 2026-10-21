import "server-only";
import { chmodSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function dataDir(): string {
  return path.resolve(process.env.GLITCHLENS_DATA_DIR || path.join(process.cwd(), "data"));
}

// Each migration runs once, in order. Never edit a shipped one: append a new entry.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('superadmin', 'member', 'viewer')),
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    INTEGER NOT NULL,
    last_login_at INTEGER
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX idx_sessions_user ON sessions(user_id);
  CREATE TABLE instances (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    base_url   TEXT NOT NULL UNIQUE,
    token_enc  TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE user_instances (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    instance_id INTEGER NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, instance_id)
  );
  CREATE INDEX idx_user_instances_instance ON user_instances(instance_id);
  CREATE TABLE login_attempts (
    key          TEXT PRIMARY KEY,
    failures     INTEGER NOT NULL,
    window_start INTEGER NOT NULL,
    locked_until INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // token_mode 'per_user': the instance has no shared token (token_enc = '') and each user stores their own.
  `
  ALTER TABLE instances ADD COLUMN token_mode TEXT NOT NULL DEFAULT 'shared' CHECK (token_mode IN ('shared', 'per_user'));
  CREATE TABLE user_tokens (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    instance_id INTEGER NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    token_enc   TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (user_id, instance_id)
  );
  `,
  // Session metadata (for the "your sessions" list and idle expiry) and the admin audit log.
  // audit_log has no foreign keys on purpose: history must outlive the users it mentions.
  `
  ALTER TABLE sessions ADD COLUMN last_used_at INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE sessions ADD COLUMN user_agent TEXT;
  ALTER TABLE sessions ADD COLUMN ip TEXT;
  UPDATE sessions SET last_used_at = created_at;
  CREATE TABLE audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    at          INTEGER NOT NULL,
    actor_id    INTEGER,
    actor_email TEXT,
    action      TEXT NOT NULL,
    target      TEXT,
    detail      TEXT,
    ip          TEXT
  );
  `,
];

const globalForDb = globalThis as unknown as { __glitchlensDb?: DatabaseSync };

function open(): DatabaseSync {
  const dir = dataDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, "glitchlens.db");
  const db = new DatabaseSync(file);
  chmodSync(file, 0o600);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");

  const { user_version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = user_version; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return db;
}

export function getDb(): DatabaseSync {
  return (globalForDb.__glitchlensDb ??= open());
}

/** Runs `fn` inside a write transaction. BEGIN IMMEDIATE takes the write lock up front. */
export function transaction<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn(db);
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
