import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/events";
import { logAiUsage } from "@/lib/cost";
import { computeEconomics } from "@/lib/economics";
import { generateAnalyticsDigest } from "@/lib/providers/llm";
import type { Agent, AgentAction } from "./types";

const SCORE_KEYS = [
  "visibilityScore",
  "profileScore",
  "reputationScore",
  "websiteSeoScore",
  "competitorGapScore",
  "conversionScore",
] as const;

type ScoreKey = (typeof SCORE_KEYS)[number];

interface DigestPayload {
  kind: "digest";
}

interface CohortSnapshotPayload {
  kind: "cohort_snapshot";
}

export const analyticsAgent: Agent = {
  name: "analytics",
  // Both actions only read existing data (computeEconomics, Audit rows) and write one internal
  // Event each — zero external footprint, same bar Scout Agent's Prospect-row creation already
  // clears. Neither is per-customer, so unlike Growth/Reputation there's nothing to loop or
  // entitlement-gate: this is Brian-facing operational cost, not customer-billed usage.
  defaultControlTier: "AUTOMATIC",

  async proposeActions(): Promise<AgentAction[]> {
    return [
      {
        controlTier: "AUTOMATIC",
        consequence: "INTERNAL_RECORD",
        summary: "Generate business digest",
        payload: { kind: "digest" } satisfies DigestPayload,
      },
      {
        controlTier: "AUTOMATIC",
        consequence: "INTERNAL_RECORD",
        summary: "Snapshot cohort visibility",
        payload: { kind: "cohort_snapshot" } satisfies CohortSnapshotPayload,
      },
    ];
  },

  async execute(action: AgentAction): Promise<void> {
    const payload = action.payload as DigestPayload | CohortSnapshotPayload;
    if (payload.kind === "digest") {
      const econ = await computeEconomics();
      const digest = await generateAnalyticsDigest({
        mrrCents: econ.mrrCents,
        arrCents: econ.arrCents,
        activeCustomerCount: econ.activeCustomerCount,
        churnRate: econ.churnRate,
        grossMarginPct: econ.grossMarginPct,
        conversionRatePct: econ.conversionRatePct,
        newCustomersLast7Days: econ.newCustomersLast7Days,
      });
      if (!digest.ok) {
        throw new Error(`Couldn't generate the analytics digest: ${digest.reason} — ${digest.detail}`);
      }

      await logAiUsage("AnalyticsDigest", "global", digest.data.meta);
      await logEvent("analytics_digest_generated", {
        payload: {
          metrics: {
            mrrCents: econ.mrrCents,
            arrCents: econ.arrCents,
            activeCustomerCount: econ.activeCustomerCount,
            churnRate: econ.churnRate,
            grossMarginPct: econ.grossMarginPct,
            conversionRatePct: econ.conversionRatePct,
            newCustomersLast7Days: econ.newCustomersLast7Days,
          },
          narrative: digest.data.narrative,
        },
      });
      return;
    }

    // Cohort visibility snapshot — pure arithmetic, no LLM call.
    const audits = await prisma.prospect.findMany({
      where: { status: "WON" },
      select: {
        audits: {
          where: { status: { in: ["COMPLETE", "PARTIAL"] } },
          orderBy: { requestedAt: "desc" },
          take: 1,
          select: {
            visibilityScore: true,
            profileScore: true,
            reputationScore: true,
            websiteSeoScore: true,
            competitorGapScore: true,
            conversionScore: true,
          },
        },
      },
      take: 25,
    });

    const latestAudits = audits.map((p) => p.audits[0]).filter((a): a is NonNullable<typeof a> => Boolean(a));

    const averages: Partial<Record<ScoreKey, number | null>> = {};
    for (const key of SCORE_KEYS) {
      const values = latestAudits.map((a) => a[key]).filter((v): v is number => typeof v === "number");
      averages[key] = values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
    }

    await logEvent("cohort_visibility_snapshot", {
      payload: { customerCount: latestAudits.length, averages },
    });
  },
};
