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

Every agent operates under Brian's control policy. Agents may analyze, create reversible
internal records, and prepare drafts. External communication, financial, contractual,
destructive, and account-ownership actions require Brian's explicit approval and execution.
Don't add an automatic shortcut for these categories.

## Bounded recurring service

The commercial product is an ongoing local-growth platform, not a one-time audit. Every plan
must define finite monthly usage, support, location, and agent-cost boundaries in `lib/plans.ts`.
Overages stop with an explicit message and require Brian's approval; never silently provide
unbounded service.

## Controlled expansion

Customer operations and agent foundations may expand only through the plan-entitlement and
Brian Control Layer boundaries above. New capabilities must preserve explicit failure states,
usage limits, cost attribution, ownership checks, and human execution for consequential work.
