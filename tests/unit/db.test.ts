import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { dataDir, getDb, transaction } from "@/lib/db";
import { withTempDataDir } from "./helpers.ts";

const base = withTempDataDir();
const nested = path.join(base, "deep", "data");
process.env.GLITCHLENS_DATA_DIR = nested;

const TABLES = [
  "audit_log", "instances", "login_attempts", "login_challenges", "recovery_codes",
  "sessions", "settings", "user_instances", "user_tokens", "users",
];

describe("opening the database", () => {
  test("creates the data directory (and parents) privately and the file for the owner only", () => {
    assert.equal(dataDir(), nested);
    const db = getDb();
    assert.ok(db);
    assert.equal(statSync(nested).mode & 0o777, 0o700);
    assert.equal(statSync(path.join(nested, "glitchlens.db")).mode & 0o777, 0o600);
  });

  test("is a singleton", () => {
    assert.equal(getDb(), getDb());
  });

  test("turns on WAL, foreign keys and a busy timeout", () => {
    const db = getDb();
    assert.equal((db.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode, "wal");
    assert.equal((db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys, 1);
    assert.equal((db.prepare("PRAGMA busy_timeout").get() as { timeout: number }).timeout, 5000);
  });

  test("applies every migration to a fresh database", () => {
    const db = getDb();
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>)
      .map((r) => r.name)
      .sort();
    assert.deepEqual(names, TABLES);
    assert.ok((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version >= 4);
  });

  test("reopening keeps the data and does not run migrations twice", () => {
    const db = getDb();
    const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    db.prepare("INSERT INTO settings (key, value) VALUES ('probe', 'kept')").run();
    db.close();
    (globalThis as { __glitchlensDb?: unknown }).__glitchlensDb = undefined;

    const again = getDb();
    assert.notEqual(again, db);
    assert.equal((again.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, version);
    assert.equal((again.prepare("SELECT value FROM settings WHERE key = 'probe'").get() as { value: string }).value, "kept");
  });

  test("a database from a newer version is opened as it is, not rewritten", () => {
    const db = getDb();
    db.exec("PRAGMA user_version = 99");
    db.close();
    (globalThis as { __glitchlensDb?: unknown }).__glitchlensDb = undefined;
    assert.equal((getDb().prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 99);
  });
});

describe("schema guarantees", () => {
  test("roles are limited to the three known ones", () => {
    const db = getDb();
    const insert = (role: string) =>
      db.prepare("INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?, 'n', 'h', ?, 0)").run(`${role}@x.com`, role);
    insert("member");
    assert.throws(() => insert("root"), /CHECK constraint/);
    assert.throws(() => insert("admin"), /CHECK constraint/);
  });

  test("emails are unique regardless of case", () => {
    const db = getDb();
    db.prepare("INSERT INTO users (email, name, password_hash, role, created_at) VALUES ('Case@X.com', 'n', 'h', 'viewer', 0)").run();
    assert.throws(
      () => db.prepare("INSERT INTO users (email, name, password_hash, role, created_at) VALUES ('case@x.COM', 'n', 'h', 'viewer', 0)").run(),
      /UNIQUE constraint failed/,
    );
  });

  test("deleting a user removes their sessions, grants, tokens and challenges", () => {
    const db = getDb();
    const { lastInsertRowid: uid } = db.prepare("INSERT INTO users (email, name, password_hash, role, created_at) VALUES ('gone@x.com', 'n', 'h', 'member', 0)").run();
    const { lastInsertRowid: iid } = db.prepare("INSERT INTO instances (name, base_url, token_enc, created_at) VALUES ('i', 'http://i', 't', 0)").run();
    db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ('h', ?, 0, 1)").run(uid);
    db.prepare("INSERT INTO user_instances (user_id, instance_id) VALUES (?, ?)").run(uid, iid);
    db.prepare("INSERT INTO user_tokens (user_id, instance_id, token_enc, created_at) VALUES (?, ?, 't', 0)").run(uid, iid);
    db.prepare("INSERT INTO login_challenges (token_hash, user_id, expires_at) VALUES ('c', ?, 1)").run(uid);
    db.prepare("INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, 'r')").run(uid);

    db.prepare("DELETE FROM users WHERE id = ?").run(uid);
    for (const table of ["sessions", "user_instances", "user_tokens", "login_challenges", "recovery_codes"]) {
      assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n, 0, table);
    }
  });

  test("deleting an instance removes the grants and tokens that point at it", () => {
    const db = getDb();
    const { lastInsertRowid: uid } = db.prepare("INSERT INTO users (email, name, password_hash, role, created_at) VALUES ('u2@x.com', 'n', 'h', 'member', 0)").run();
    const { lastInsertRowid: iid } = db.prepare("INSERT INTO instances (name, base_url, token_enc, created_at) VALUES ('i2', 'http://i2', 't', 0)").run();
    db.prepare("INSERT INTO user_instances (user_id, instance_id) VALUES (?, ?)").run(uid, iid);
    db.prepare("INSERT INTO user_tokens (user_id, instance_id, token_enc, created_at) VALUES (?, ?, 't', 0)").run(uid, iid);
    db.prepare("DELETE FROM instances WHERE id = ?").run(iid);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM user_instances WHERE instance_id = ?").get(iid) as { n: number }).n, 0);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM user_tokens WHERE instance_id = ?").get(iid) as { n: number }).n, 0);
  });

  test("foreign keys are enforced: a session cannot point at a missing user", () => {
    assert.throws(() => getDb().prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ('x', 999999, 0, 1)").run(), /FOREIGN KEY/);
  });
});

describe("transaction", () => {
  test("commits and returns the callback's value", () => {
    const out = transaction((db) => {
      db.prepare("INSERT INTO settings (key, value) VALUES ('tx-ok', '1')").run();
      return "done";
    });
    assert.equal(out, "done");
    assert.equal((getDb().prepare("SELECT value FROM settings WHERE key = 'tx-ok'").get() as { value: string }).value, "1");
  });

  test("rolls everything back and rethrows when the callback throws", () => {
    assert.throws(
      () =>
        transaction((db) => {
          db.prepare("INSERT INTO settings (key, value) VALUES ('tx-bad', '1')").run();
          throw new Error("boom");
        }),
      /boom/,
    );
    assert.equal(getDb().prepare("SELECT value FROM settings WHERE key = 'tx-bad'").get(), undefined);
  });

  test("leaves the connection usable after a rollback", () => {
    assert.throws(() => transaction(() => { throw new Error("x"); }));
    assert.equal(transaction(() => 7), 7);
  });

  test("a second connection sees committed data (WAL) and the file exists on disk", () => {
    transaction((db) => db.prepare("INSERT INTO settings (key, value) VALUES ('shared', 'yes')").run());
    assert.ok(existsSync(path.join(nested, "glitchlens.db")));
    const other = new DatabaseSync(path.join(nested, "glitchlens.db"));
    assert.equal((other.prepare("SELECT value FROM settings WHERE key = 'shared'").get() as { value: string }).value, "yes");
    other.close();
  });
});
