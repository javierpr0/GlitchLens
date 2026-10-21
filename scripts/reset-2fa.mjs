// Break-glass for a locked-out account (for example the only superadmin lost their device and recovery codes).
// Needs access to the server, same trust level as reading the database. Usage: npm run reset-2fa -- user@example.com
import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const email = process.argv[2];
if (!email) {
  console.error("Usage: npm run reset-2fa -- <email>");
  process.exit(2);
}

const dir = path.resolve(process.env.GLITCHLENS_DATA_DIR || path.join(process.cwd(), "data"));
const file = path.join(dir, "glitchlens.db");
if (!existsSync(file)) {
  console.error(`No GlitchLens database at ${file}. Run this from the project folder or set GLITCHLENS_DATA_DIR.`);
  process.exit(1);
}
const db = new DatabaseSync(file);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 5000");

const user = db.prepare("SELECT id, email, totp_enabled FROM users WHERE email = ?").get(email.trim());
if (!user) {
  console.error(`No user with email ${email}`);
  process.exit(1);
}

db.exec("BEGIN IMMEDIATE");
db.prepare("UPDATE users SET totp_secret_enc = NULL, totp_enabled = 0, totp_last_step = 0 WHERE id = ?").run(user.id);
db.prepare("DELETE FROM recovery_codes WHERE user_id = ?").run(user.id);
db.prepare("DELETE FROM login_challenges WHERE user_id = ?").run(user.id);
db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
db.prepare("INSERT INTO audit_log (at, actor_id, actor_email, action, target) VALUES (?, NULL, ?, '2fa.reset_cli', ?)").run(
  Date.now(),
  "server console",
  user.email,
);
db.exec("COMMIT");
console.log(`Two-factor reset for ${user.email}. All their sessions were ended.`);
