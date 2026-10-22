# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-21

First public release.

### Added
- Dashboard for GlitchTip: overview, issues (filters, comments, bulk actions), performance, releases, alerts, uptime, logs, teams and projects.
- Multiple GlitchTip instances, switchable from the top bar, with a connection test when adding one.
- Local accounts with three roles (`superadmin`, `member`, `viewer`), a first-run setup page protected by a one-time code, and optional creation of the first superadmin from environment variables.
- Per instance, a choice between one shared token or one token per user, so GlitchTip can attribute actions to the real person.
- Select every issue matching a search across all pages for bulk actions, with a typed confirmation to delete.
- Optional two-factor authentication (TOTP) with recovery codes, and a policy to require it for superadmins or for everyone.
- Audit log of sign-ins and administrative changes, and session management with idle expiry.
- Strict Content-Security-Policy with a per-request nonce, security headers, rate limiting on login, and encrypted storage of GlitchTip tokens.
- Self-contained storage in SQLite (`node:sqlite`): no external database, cache or queue.
- Docker image with a health check, `GET /api/health`, and a `reset-2fa` command for lockouts.
- 400+ unit tests and an end-to-end suite.

### Compatibility
- Tested against GlitchTip 6.2.6.

[0.1.0]: https://github.com/javierpr0/GlitchLens/releases/tag/v0.1.0
