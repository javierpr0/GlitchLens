# Contributing to GlitchLens

Thanks for taking the time. GlitchLens is a small project with a clear shape, so a quick read of this page will save you a round trip.

## Before you start

- **Bugs and ideas:** open an issue first for anything bigger than a small fix, so we can agree on the approach before you write code.
- **Security problems:** do not open a public issue. Follow [SECURITY.md](SECURITY.md).
- **Scope:** GlitchLens is a dashboard for GlitchTip. Features that GlitchTip only serves to a browser session (your own profile, MFA, personal tokens) are intentionally out of scope.

## Setting up

You need Node.js 22.13 or newer.

```bash
git clone <your fork>
cd glitchlens
npm install
npm run dev          # http://localhost:3000, prints a setup code on first start
```

The database and the encryption key live in `./data` (ignored by git). Delete that folder to start from scratch.

A GlitchTip to point at: the quickest is the official [compose file](https://glitchtip.com/documentation/install). Create an organization, a project and an API token with all scopes.

## Before you open a pull request

```bash
npx tsc --noEmit        # types
npm run lint
npm run test:unit
npm run build && npm run test:e2e
```

CI runs the same commands plus `npm audit --omit=dev`.

## How the code is organised

| Path | What lives there |
| --- | --- |
| `src/lib` | Server logic: database, sessions, users, instances, 2FA, the GlitchTip client |
| `src/app/api` | Route handlers. Only code here (and in server components) talks to GlitchTip |
| `src/components` | UI. Client components only where there is interactivity |
| `tests/unit` | Unit tests (`node:test`, no extra dependencies) |
| `scripts/e2e` | End-to-end suite and the fake GlitchTip servers it uses |

## Ground rules

- **Every route handler starts with `guardRequest()`.** It checks the session, the role, the 2FA policy and the origin. If a new endpoint does not need it, say why in the pull request.
- **Never send a token to the browser** and never log one. Instance and personal tokens are encrypted in the database.
- **Validate input at the boundary** with Zod. Do not trust anything that comes from the request or from GlitchTip (event data is written by whoever sends errors).
- **Migrations are append-only:** add an entry to the list in `src/lib/db/index.ts`, never edit a shipped one.
- **Keep it simple.** A change should do what it says. No speculative abstractions, no unrelated refactors.
- **Tests:** a bug fix comes with a test that fails without it. Security-relevant behaviour (roles, sessions, 2FA, throttling) needs a unit test and, if it crosses HTTP, an end-to-end case.

## Commit messages

English, imperative, first line up to 50 characters, one purpose per commit: `fix: stop deleting the wrong page cursor`.
Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`.

## Licensing

By contributing you agree that your work is released under the project's MIT license.
