# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's private vulnerability reporting
(Security tab > Report a vulnerability) on this repository, and include:

- what you found and where (file, route or screen),
- steps to reproduce,
- the impact you expect.

You will get an answer within a few days. Fixes ship as a patch release and are credited if you want.

## Scope

In scope: authentication and sessions, role checks, the GlitchTip proxy under `/api/glitchtip`,
instance and token storage, and anything that exposes data across users or instances.

Out of scope: vulnerabilities in GlitchTip itself, and issues that need an already-compromised
server or superadmin account.

## Known limitations

- Two-factor authentication is optional per user: there is no setting to require it for everyone yet.
- No `Content-Security-Policy` header yet. Add one at your reverse proxy if you need it.
- Login throttling counters for non-existent emails and IPs live in memory and reset on restart.
- `node:sqlite` is still experimental in Node 22.

## Hardening checklist for operators

- Serve GlitchLens over HTTPS only and forward `X-Forwarded-Proto`.
- Set `GLITCHLENS_SECRET` from a secret manager so tokens are not encrypted with a key stored next to the database. Rotating that key makes stored tokens, 2FA secrets and recovery codes unreadable; affected users are denied (never let through on the password alone) until reset.
- Encourage 2FA, at least for superadmins.
- Use a dedicated GlitchTip account for shared tokens, and prefer per-user tokens where attribution matters.
- Back up the data directory and keep the backup as protected as the database itself.
- Run a single GlitchLens process per data directory.
