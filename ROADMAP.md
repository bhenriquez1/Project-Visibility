# Roadmap

This repo currently implements **V1** only. V2 and V3 are documented here for direction so V1's
architecture doesn't foreclose them — see the `ApprovalTier` enum, `unavailableSources` pattern,
and the provider interface in `lib/providers/*` for the seams left for this purpose. Neither is
implemented yet; do not build against this section without an explicit go-ahead.

## V1 — Cash-flow MVP (this repo, current state)

Find a local business → show it a real opportunity → convert it into a recurring paying
customer. Public audit funnel, CRM pipeline, human-approved AI outreach, Stripe billing
foundation, economics dashboard. See `README.md` for what's built.

## V2 — Service + Retain

Once paying customers exist: the customer authorizes access to their own business
information/accounts (this is where Google Business Profile's OAuth-based API replaces the
public Places lookup used for V1 prospecting). That authorization unlocks:

- Legitimate optimization actions, review monitoring + response drafts, content
  recommendations, local-search analysis, competitor monitoring, performance reporting.
- A customer-facing dashboard: Visibility Score, Reviews, Leads/actions, Competitors, Changes
  completed, Recommended actions, Monthly performance, "Ask your AI Growth Manager."
- Recurring billing already exists from V1; V2 makes retention as important as acquisition —
  detecting falling visibility, unanswered reviews, deteriorating engagement, customer
  inactivity, and approaching renewal/cancellation risk.

## V3 — Agent company

Only after V1 and V2 generate enough real-world data. Pipeline:

Scout Agent → Audit Agent → Sales Agent → Onboarding Agent → Growth Agent → Reputation Agent →
Analytics Agent → Retention Agent.

Above all of it, the **Brian Control Layer** (the schema already reserves this today via
`ApprovalTier`, unused beyond V1's all-approval-required default):

- 🟢 **Automatic** — routine analysis, monitoring, reporting, approved optimization classes,
  ordinary customer communication.
- 🟡 **AI can prepare, Brian approves** — new sales offers, unusual GBP changes, significant
  customer commitments, new campaign types.
- 🔴 **Brian only** — pricing-policy changes, refunds above threshold, contracts, ad spending,
  deleting customer assets, changing ownership/access, financial commitments.

## Economics discipline (applies at every stage)

Per customer: MRR − payment fees − AI/API usage − data costs − infrastructure − attributable
advertising/outreach − human support = contribution margin. Globally: MRR, ARR, churn, CAC,
LTV, gross margin, conversion rate, AI cost/customer. V1's economics dashboard already
implements this — V2/V3 should extend it, not replace it, as ad-platform and support-cost
integrations become real instead of manually-entered estimates.
