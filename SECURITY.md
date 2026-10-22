# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's private vulnerability reporting
([report a vulnerability](https://github.com/javierpr0/GlitchLens/security/advisories/new), or Security tab > Report a vulnerability), and include:

- what you found and where (file, route or screen),
- steps to reproduce,
- the impact you expect.

You will get an answer within a few days. Fixes ship as a patch release and are credited if you want.

## Scope

Maintainer: Eduardo Maldonado ([www.emac.dev](https://www.emac.dev)).

In scope: authentication and sessions, role checks, the GlitchTip proxy under `/api/glitchtip`,
instance and token storage, and anything that exposes data across users or instances.

Out of scope: vulnerabilities in GlitchTip itself, and issues that need an already-compromised
server or superadmin account.

## Known limitations

- Two-factor authentication is optional by default. A superadmin can require it for superadmins or for everyone (Settings > Users).
- The Content-Security-Policy is strict for scripts (per-request nonce, no `unsafe-inline`/`unsafe-eval` in production) but allows inline styles, which the UI libraries (charts, toasts, popovers) require. It deliberately omits `upgrade-insecure-requests` so plain-HTTP LAN installs keep working.
- No HSTS header: set it at your HTTPS reverse proxy.
- With a 2FA policy on, an account that has not enrolled yet signs in with its password alone and enrols at that moment. If someone else already knows that password they can enrol first. Turn the policy on before handing out passwords, and watch `2fa.enable` in the audit log.
- Login throttling counters for non-existent emails and IPs live in memory and reset on restart.
- `node:sqlite` is still experimental in Node 22.

## Hardening checklist for operators

- Serve GlitchLens over HTTPS only and forward `X-Forwarded-Proto`.
- Set `GLITCHLENS_SECRET` from a secret manager so tokens are not encrypted with a key stored next to the database. Rotating that key makes stored tokens, 2FA secrets and recovery codes unreadable; affected users are denied (never let through on the password alone) until reset.
- Require 2FA at least for superadmins (Settings > Users > Two-factor policy).
- Use a dedicated GlitchTip account for shared tokens, and prefer per-user tokens where attribution matters.
- Back up the data directory and keep the backup as protected as the database itself.
- Run a single GlitchLens process per data directory.
