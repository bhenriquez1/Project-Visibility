# Project Visibility (V1) — "Local Visibility AI"

Internal codename: **Project Visibility**. Public-facing brand: **Local Visibility AI**.

V1's only objective: find a local business → show it a real opportunity → convert it into a
recurring paying customer. See [`ENGINEERING_STANDARDS.md`](./ENGINEERING_STANDARDS.md) for the
non-negotiable rules this codebase follows (no fake data, no ranking promises, no premature
autonomy).

## Stack

Next.js (App Router) + TypeScript, Postgres + Prisma, NextAuth (single admin), Tailwind, OpenAI
(audit reasoning + outreach/reply drafts), Google Places API (public business data), SerpAPI
(search visibility + competitors), Stripe (subscriptions), Resend (transactional email).

## Local setup

1. **Database.** This repo ships a `docker-compose.yml` for local Postgres:
   ```bash
   docker compose up -d
   ```
   No Docker? Point `DATABASE_URL` in `.env` at any local Postgres 16 instance instead.

2. **Environment.** Copy `.env.example` to `.env` and fill in whatever keys you have. Every
   integration is optional at the code level — an unset key produces an explicit "not
   configured" state in the UI rather than fake data, so you can run the app with only some
   keys set.

3. **Install + migrate + seed:**
   ```bash
   npm install
   npm run db:migrate
   npm run seed
   ```
   The seed script creates the single admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`.

4. **Run it:**
   ```bash
   npm run dev
   ```
   Public funnel: http://localhost:3000 · Admin: http://localhost:3000/admin (redirects to
   `/login`).

## What's here (V1 milestones)

1. Foundation — auth, schema, base layouts.
2. Audit engine — free-audit funnel → website/Places/SERP providers → OpenAI scoring/narrative → public report page.
3. CRM + outreach — pipeline board, AI-drafted outreach with mandatory human approval before send, reply logging.
4. Billing foundation — Stripe Checkout on Won, webhook-driven subscription records.
5. Economics dashboard — per-customer contribution margin and global MRR/ARR/churn/CAC/LTV/gross margin/AI cost.

V2 (customer-authorized ops/retention) and V3 (autonomous agent pipeline, tiered autonomy) are
deliberately **not** implemented — see the plan history for the intended direction. The
`ApprovalTier` enum and `unavailableSources` pattern exist now specifically so those can be
added later without a schema rewrite.
