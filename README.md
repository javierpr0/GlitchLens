# GlitchLens

A self-hosted dashboard for [GlitchTip](https://glitchtip.com). Sign in with your own team accounts and look at issues, performance, releases, alerts, uptime, logs and projects from one interface, across **one or many GlitchTip instances**.

GlitchLens keeps everything it needs in a local SQLite file. There is no external database, cache or queue to run.

> GlitchLens is an independent project and is not affiliated with or endorsed by GlitchTip.

## Features

- First-run setup: create the **superadmin** from the browser or from environment variables.
- The superadmin creates more users and assigns each one to the instances they may see.
- Three roles: `superadmin` (manages users and instances), `member` (works with issues, alerts, projects), `viewer` (read-only).
- Connect **multiple GlitchTip instances** and switch between them from the top bar.
- Instance settings are managed inside the app (URL + API token, with a connection test). Tokens are encrypted at rest.
- Per instance, choose **one shared token** or **one token per user**, so GlitchTip can attribute actions to the real person.
- Dashboard, issues (filters, bulk actions, comments), performance, releases, alerts, uptime, logs, teams and projects.
- **Two-factor authentication** (TOTP): any authenticator app, with 10 single-use recovery codes. Each user turns it on from Settings > Account.
- **Audit log** (superadmin): sign-ins, lockouts and changes to users, instances and tokens, kept 180 days. Never stores passwords or tokens.
- **Session management**: see and revoke your own sessions, sign out everywhere else. Sessions expire after 7 days idle or 14 days in total.
- Installable as a PWA, responsive, dark theme.

## Requirements

- Node.js **22.13 or newer** (GlitchLens uses the built-in `node:sqlite`, which is still marked experimental by Node.js, so you will see a warning on startup), or Docker.
- A GlitchTip server reachable from where GlitchLens runs, and an API token for it.

## Quick start

```bash
git clone <this repository> glitchlens
cd glitchlens
npm install
npm run build
npm start
```

Open <http://localhost:3000>. On first start the console prints a **setup code**:

```
 GlitchLens setup
 No users exist yet. Open /setup in your browser to create the superadmin.
 Setup code: xxxxxxxxxxxx
```

Open `/setup`, paste the code and create the superadmin. The code stops the first visitor who finds a freshly deployed instance from claiming it.

Prefer no browser step? Set `GLITCHLENS_ADMIN_EMAIL` and `GLITCHLENS_ADMIN_PASSWORD` and the superadmin is created at startup.

### Docker

```bash
docker compose up -d --build
docker compose logs glitchlens | grep "Setup code"
```

Data lives in the `glitchlens-data` volume (`/data` in the container). Back that volume up.

## Connecting a GlitchTip instance

1. In GlitchTip open your profile, go to **Auth Tokens** and create a token. Selecting all scopes lets GlitchLens manage issues, projects and alerts; a read-only token is enough if you only want to look.
2. In GlitchLens go to **Settings > Instances > Add instance**, enter the URL and the token, and use **Test connection**.
3. Go to **Settings > Users** to add your team and choose which instances each person can see.

### Shared token or one token per user

GlitchLens users are separate from GlitchTip users, so each instance has a switch (Settings > Instances):

| Mode | How it works |
| --- | --- |
| **One shared token** | You enter a single token. Every request goes through it, so GlitchTip records all actions (resolving issues, comments, assignments) as the token's owner. Use a dedicated GlitchTip account if you want a clean audit trail. |
| **One token per user** | No shared token is stored. Each person adds their own in **Settings > Account**, and GlitchTip records their actions under their own account and enforces their own permissions. Users without a token see a prompt to add one. |

Roles are applied by GlitchLens on top of either mode:

| Role | Can do |
| --- | --- |
| `viewer` | Read everything on assigned instances. No changes, in any mode. |
| `member` | Everything a viewer can, plus changing issues, alerts, keys, teams and projects. With a **shared** token it cannot delete projects or teams, manage organization members or edit the organization (otherwise it would be a backdoor to the token owner's privileges). With **per-user** tokens those limits are left to GlitchTip. |
| `superadmin` | Everything, including users and instances. Sees all instances. |

Pages that GlitchTip only serves to a signed-in browser session (your own GlitchTip profile, MFA, personal tokens) are intentionally not part of GlitchLens. Manage those in GlitchTip.

## Configuration

All optional. See [`.env.example`](.env.example).

| Variable | Purpose |
| --- | --- |
| `GLITCHLENS_DATA_DIR` | Directory for the SQLite database and key file. Default `./data`. |
| `GLITCHLENS_SECRET` | Key (32+ chars) that encrypts instance tokens. If unset, a random key is generated once into `<data dir>/secret.key`. |
| `GLITCHLENS_ADMIN_EMAIL`, `GLITCHLENS_ADMIN_PASSWORD` | Create the first superadmin at startup. |
| `GLITCHLENS_SETUP_CODE` | Fixed setup code instead of a random one. |
| `GLITCHLENS_TRUST_PROXY` | `true` when behind exactly one reverse proxy you control: enables per-IP login throttling. Off by default because `X-Forwarded-For` is client-controlled. |
| `GLITCHLENS_COOKIE_SECURE` | `true` or `false` to force the `Secure` cookie flag. By default it follows HTTPS / `X-Forwarded-Proto`. |
| `PORT`, `HOSTNAME` | Standard Next.js server settings. |

## Security notes

- Passwords are hashed with scrypt. Sessions are random tokens stored hashed in the database and can be revoked server side. Changing a password or disabling an account signs the user out everywhere, and sessions expire after 7 days without activity (14 days at most).
- Five failed logins lock that account for 15 minutes. With `GLITCHLENS_TRUST_PROXY=true` the source IP is throttled too.
- If the encryption key lives next to the database (the default), it protects tokens only against someone who gets the database file alone, for example from a backup. For stronger separation set `GLITCHLENS_SECRET` from your secret manager.
- Only a superadmin can set an instance URL. GlitchLens will call any `http(s)` address you give it, including private ones, because self-hosted GlitchTip usually lives there.
- Run it behind HTTPS (a reverse proxy is fine) and forward `X-Forwarded-Proto`. GlitchLens sends a strict Content-Security-Policy (per-request nonce for scripts); add HSTS at the proxy.
- Single process by design: login throttling and sessions use the local database, so run one instance per data directory.

## Two-factor authentication

Each user can enable TOTP in **Settings > Account**: scan the QR code, confirm with a code, and save the recovery codes (shown once). From then on, signing in asks for the password and then a code. Turning it off or generating new recovery codes needs the password and a valid code. Enabling it signs the user out of their other sessions.

If someone loses their device and recovery codes, a superadmin can reset their 2FA in **Settings > Users > Edit**. If the locked-out account is the only superadmin, run this on the server instead (it needs access to the data directory, the same trust level as reading the database):

```bash
npm run reset-2fa -- admin@example.com                       # from the project folder
docker compose exec glitchlens node scripts/reset-2fa.mjs admin@example.com   # Docker
```

**Changing or losing the encryption key** (`GLITCHLENS_SECRET` or `secret.key`) makes every 2FA secret and recovery code unreadable. Those users are refused at login (it never falls back to the password alone) until a superadmin resets their 2FA.

## Backups

Everything GlitchLens stores is in the data directory (`GLITCHLENS_DATA_DIR`, `/data` in Docker): `glitchlens.db` (plus `-wal` and `-shm`) and, unless you set `GLITCHLENS_SECRET`, `secret.key`.

- **Simplest:** stop GlitchLens, copy the whole directory, start it again.
- **Live:** `sqlite3 data/glitchlens.db ".backup 'glitchlens-backup.db'"`, and copy `secret.key` alongside it.
- **Restore:** put the files back in an empty data directory and start GlitchLens.

Without the key (`secret.key` or the same `GLITCHLENS_SECRET`) the stored GlitchTip tokens cannot be decrypted. Users and instances keep working, but tokens must be entered again. Treat backups as sensitive: they contain password hashes and encrypted tokens.

## Health check

`GET /api/health` returns `{"status":"ok"}` when the process is up and the database answers (`503` otherwise). The Docker image uses it for its `HEALTHCHECK`.

## Development

```bash
npm run dev      # http://localhost:3000
npm run build
npm run lint
npm run build && npm run test:e2e   # end-to-end suite against fake GlitchTip servers
```

Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui, TanStack Query, Zod, Recharts, `node:sqlite`.

```
src/lib/db          SQLite connection and migrations
src/lib/crypto.ts   token encryption, password hashing
src/lib/auth.ts     sessions
src/lib/users.ts    users, roles, login
src/lib/instances.ts  instances, active-instance resolution, connection test
src/lib/glitchtip   GlitchTip API client and types
scripts/e2e         end-to-end suite and fake GlitchTip used by it
src/app/api         route handlers (the only code that talks to GlitchTip)
```

The browser never talks to GlitchTip. Route handlers under `src/app/api` do, using the active instance's token.

## Known limitations

Styles still allow inline rules (`style-src 'unsafe-inline'`) because the UI libraries need them; scripts do not. 2FA is optional per user. See [SECURITY.md](SECURITY.md) for how to report a vulnerability and a hardening checklist.

## License

[MIT](LICENSE)
