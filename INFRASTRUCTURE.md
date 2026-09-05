# Infrastructure handoff (Codex)

Claude (this repo's application architecture, UI, business logic, audit engine, CRM,
subscriptions, and provider abstractions) and Codex (Supabase/Postgres infrastructure) are
working in parallel. This document is the interface between the two: what Codex owns, what
Claude owns, and how to prove the handoff worked — without either side needing to sit in the
other's session.

## Boundary

**Codex owns:**
- Creating/configuring the Supabase project.
- Getting a working `DATABASE_URL` (and any other infra-only env vars) into `.env` locally.
- Running Prisma migrations against that database (`npx prisma migrate dev` for the first one,
  since `prisma/migrations/` doesn't exist yet — no history to reconcile).
- Verifying connectivity (see below).
- Dev/test database configuration (e.g. a separate Supabase project or schema for tests, if
  that becomes necessary).
- Secret hygiene: `.env` must never be committed. `.gitignore` already excludes `.env*` except
  `.env.example` — keep it that way. If this ever gets deployed, secrets belong in the hosting
  platform's secret store, not in a file in the repo.

**Codex does NOT own:**
- `prisma/schema.prisma` — the data model is part of the application architecture. If
  infrastructure setup reveals the schema needs to change (a constraint Supabase enforces
  differently, a naming collision, etc.), flag it rather than editing the schema directly.
- Any file under `src/app`, `src/components`, or `src/lib` other than what's needed to make the
  Prisma client connect (i.e. don't touch business logic, providers, or UI).

## What's required

- **Required env vars** — see `.env.example` for the full list with comments. The
  infrastructure-relevant ones are `DATABASE_URL` (Postgres connection string) and nothing else;
  every other var in that file (OpenAI, Google Places, SerpAPI, Stripe, Resend keys) is already
  filled in locally and is unrelated to this handoff.
- **Schema** — `prisma/schema.prisma` is the single source of truth for tables/enums/relations.
  Don't hand-write SQL migrations; let `prisma migrate dev` generate them from that file.
- **Commands, once `DATABASE_URL` is live:**
  ```bash
  npx prisma migrate dev --name init   # creates prisma/migrations/ and applies it
  npm run seed                          # creates the single admin user from ADMIN_EMAIL/ADMIN_PASSWORD
  ```

## Verification (how to prove it worked)

Hit `GET /api/health` (added for exactly this purpose — see `src/app/api/health/route.ts`) with
the dev server running (`npm run dev`):

```bash
curl -s http://localhost:3000/api/health | jq
```

- `{"ok": true, "database": "connected"}` — migrations applied and the app can query.
- `{"ok": false, "database": "unreachable", "detail": "..."}` — still broken; the `detail` field
  has the raw Postgres/Prisma error to act on.

This is intentionally the same "no fake data, no silent fallback" pattern used everywhere else
in this codebase (see `ENGINEERING_STANDARDS.md`): the endpoint never claims a connection that
doesn't exist.

## Status

`DATABASE_URL` now points at a real Supabase instance (as of this writing). Migrations
(`npx prisma migrate dev --name init`) and `npm run seed` still need to be run and verified via
`GET /api/health` before any DB-backed route can be trusted — until that's confirmed, treat every
DB-backed route in the app (the audit funnel, admin CRM, billing, economics dashboard) as
"waiting on infrastructure," not broken code. That's the expected, honest state; it is not a bug
to route around with mock data.

**Working-directory coordination:** Claude and Codex have both been operating directly in this
same local working directory/`.git` at the same time, which has already corrupted `.git`
metadata once (recovered — no commits or data were lost, `main` still matched `origin/main`
exactly). Avoid running `git`, `npm install`, or `next dev`/`next build` in this folder at the
same moment as the other agent. Prefer: finish a change, commit, and say so, before the other
agent's next write — or work from separate clones/worktrees and sync via `git push`/`pull`
instead of sharing one working tree's `.git` internals live.

## Addendum: Google OAuth (V2 — customer sign-in + Business Profile access)

V2 adds "Sign in with Google" for customers, which also captures the OAuth consent needed to
read/reply to their Google reviews. This needs a Google Cloud OAuth 2.0 Client, same account as
the existing Places API project:

1. **Enable APIs**: "Google Business Profile API" (via the API Library), plus verify the split
   Account Management and Business Information APIs are enabled. Note: the Account Management
   API has shipped with a default quota of **0** for new projects — enabling it is not enough,
   a quota increase must be requested from Google (via the in-console quota request flow)
   before `accounts.list` will return anything. Flag this early; it can take time to be granted.
2. **OAuth consent screen**: set publishing status to **Testing** (not Production) — this avoids
   Google's full app-verification process, which isn't worth pursuing at founding-customer scale
   (Testing supports up to 100 test users). Add each founding customer's Google account email as
   a test user as they're onboarded.
3. **Create an OAuth 2.0 Client ID** (Application type: **Web application**). Authorized redirect
   URI: `{NEXTAUTH_URL}/api/auth/callback/google` (e.g. `http://localhost:3000/api/auth/callback/google`
   for local dev).
4. **Scope requested by the app**: `https://www.googleapis.com/auth/business.manage` (already
   wired into `src/lib/auth.ts` — nothing to configure beyond the consent screen listing it).
5. Put the resulting values in `.env`: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`.

Verification: with those two env vars unset, `/portal/login` shows an explicit "not configured"
message. Once set, restart the dev server and `/portal/login` shows a working "Sign in with
Google" button.
