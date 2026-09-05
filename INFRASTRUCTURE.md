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

**Waiting on infrastructure as of now.** Every DB-backed route in the app (the audit funnel,
admin CRM, billing, economics dashboard) already fails loudly and explicitly when the database
is unreachable — see the "Can't reach database server" errors surfaced in `npm run dev` logs and
the generic-but-honest error shown to end users. That's expected until this handoff completes;
it is not a bug to route around with mock data.
