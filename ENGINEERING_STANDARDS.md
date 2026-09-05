# Engineering standards

These are non-negotiable for this codebase. They exist because of a real past incident (the
"Reader" project) where a placeholder/legacy fallback silently posed as a working integration,
and it went unnoticed for a long time.

## No fake data, no silent fallbacks

If an external integration (OpenAI, Google Places, SerpAPI, Stripe, Resend) is unconfigured,
misconfigured, or fails at call time, the system must say so explicitly — in the UI, in the
stored record, and in logs. It must never:

- return a hardcoded or randomly-generated number in place of a real score,
- reuse stale data without labeling it as stale,
- catch an error and silently substitute a "reasonable-looking" default,
- pretend an unsent message was sent, or an unrun audit step ran.

Concretely: every provider in `lib/providers/*` returns a discriminated result
(`{ ok: true, data }` or `{ ok: false, reason: "NOT_CONFIGURED" | "REQUEST_FAILED", detail }`),
never a best-guess value. Callers persist and render the failure state — see `Audit.status`,
`Audit.unavailableSources`.

## No ranking promises

The audit product must never claim or imply a specific Google ranking outcome. Scores are
qualitative buckets (`ScoreLevel`), and copy should describe opportunities, not guarantees.

## No premature autonomy

Every outbound action in V1 (an email to a prospect, a Stripe charge) requires an explicit
human approval step. Don't add a "send automatically" shortcut, even for convenience — the
approval gate is the whole point of the V1→V2→V3 trust curve.

## No scope creep into V2/V3

Don't build the customer-facing dashboard, autonomous agents, or automated optimization
actions described in the roadmap. Do keep data models and provider interfaces from requiring
a rewrite when those are built later (e.g. `ApprovalTier`, `unavailableSources`).
