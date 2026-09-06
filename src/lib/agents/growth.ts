import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/events";
import { logAiUsage } from "@/lib/cost";
import { runAudit } from "@/lib/audit/runAudit";
import { generateGrowthRecommendations } from "@/lib/providers/llm";
import { assertMonthlyAiEntitlement } from "@/lib/entitlements";
import type { Agent, AgentAction } from "./types";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const STRONG_THRESHOLD = 71;

const SCORE_LABELS = {
  visibilityScore: "Google/local visibility",
  profileScore: "Profile completeness",
  reputationScore: "Reputation & reviews",
  websiteSeoScore: "Website & local SEO",
  competitorGapScore: "Competitor gap",
  conversionScore: "Conversion opportunities",
} as const;

interface RefreshAuditPayload {
  prospectId: string;
}

interface RecommendationsPayload {
  prospectId: string;
  opportunities: string[];
}

async function hasAuditBudgetRemaining(prospectId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await assertMonthlyAiEntitlement(prospectId, "auditsPerMonth", "Audit", "visibility audits");
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Entitlement check failed." };
  }
}

/**
 * Only flags REAL sub-70 scores, never the absence of data — an unavailable source means "we
 * don't know," not "there's a problem to fix." Conflating the two in a customer-facing email
 * would be a fabricated finding.
 */
function collectOpportunities(audit: Record<keyof typeof SCORE_LABELS, number | null>): string[] {
  return (Object.keys(SCORE_LABELS) as Array<keyof typeof SCORE_LABELS>)
    .filter((key) => typeof audit[key] === "number" && audit[key]! < STRONG_THRESHOLD)
    .map((key) => `${SCORE_LABELS[key]} (${audit[key]}/100)`);
}

export const growthAgent: Agent = {
  name: "growth",
  // Two distinct action classes: refreshing an audit is the same non-external analysis Audit
  // Agent already performs; drafting recommendations is the same email-draft-then-approve shape
  // Sales/Onboarding already use. Neither writes to a customer's live GBP listing — that
  // capability doesn't exist here (see the file-level plan note) and would be EXTERNAL_COMMUNICATION,
  // blocked from autonomous execution regardless of tier.
  defaultControlTier: "AI_PREPARED",

  async proposeActions(): Promise<AgentAction[]> {
    const candidates = await prisma.prospect.findMany({
      where: { status: "WON" },
      select: {
        id: true,
        businessName: true,
        email: true,
        googleBusinessConnection: { select: { revokedAt: true } },
        messages: { where: { status: "PENDING_APPROVAL" }, select: { id: true }, take: 1 },
        audits: {
          orderBy: { requestedAt: "desc" },
          take: 1,
          select: {
            status: true,
            requestedAt: true,
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

    const actions: AgentAction[] = [];
    let skippedNoEmail = 0;
    const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS);

    for (const p of candidates) {
      const gbpConnected = Boolean(p.googleBusinessConnection && !p.googleBusinessConnection.revokedAt);
      if (!gbpConnected) continue; // "authorized optimizations" — only applies once a customer has connected.

      const latestAudit = p.audits[0];
      const isStale = !latestAudit || latestAudit.requestedAt < sevenDaysAgo;
      let proposedRefresh = false;

      if (isStale) {
        const budget = await hasAuditBudgetRemaining(p.id);
        if (budget.ok) {
          actions.push({
            controlTier: "AUTOMATIC",
            consequence: "ANALYSIS",
            summary: `Refresh audit: ${p.businessName}`,
            payload: { prospectId: p.id } satisfies RefreshAuditPayload,
          });
          proposedRefresh = true;
        } else {
          await logEvent("growth_agent_skipped_audit_limit", { prospectId: p.id, payload: { reason: budget.reason } });
        }
      }

      if (proposedRefresh) continue; // wait for the fresh audit before recommending off it

      if (!latestAudit || (latestAudit.status !== "COMPLETE" && latestAudit.status !== "PARTIAL")) continue;

      const opportunities = collectOpportunities(latestAudit);
      if (opportunities.length === 0) continue;
      if (p.messages.length > 0) continue; // duplicate guard — something's already pending approval

      if (!p.email) {
        skippedNoEmail += 1;
        continue;
      }

      actions.push({
        controlTier: "AI_PREPARED",
        consequence: "DRAFT",
        summary: `Draft growth recommendations: ${p.businessName}`,
        payload: { prospectId: p.id, opportunities } satisfies RecommendationsPayload,
      });
    }

    if (skippedNoEmail > 0) {
      await logEvent("growth_agent_skipped_no_email", { payload: { count: skippedNoEmail } });
    }

    return actions;
  },

  async execute(action: AgentAction): Promise<void> {
    if (action.consequence === "ANALYSIS") {
      const { prospectId } = action.payload as RefreshAuditPayload;
      const audit = await prisma.audit.create({ data: { prospectId } });
      await logEvent("audit_requested", { prospectId, payload: { auditId: audit.id, source: "growth_agent" } });

      try {
        await runAudit(audit.id);
      } catch (err) {
        await prisma.audit.update({
          where: { id: audit.id },
          data: {
            status: "FAILED",
            error: err instanceof Error ? err.message : "Unexpected error running the audit.",
            completedAt: new Date(),
          },
        });
      }
      return;
    }

    const { prospectId, opportunities } = action.payload as RecommendationsPayload;
    const prospect = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } });
    if (!prospect.email) return; // re-checked defensively; proposeActions already filters this.

    const draft = await generateGrowthRecommendations({ businessName: prospect.businessName, opportunities });
    if (!draft.ok) {
      throw new Error(`Couldn't generate growth recommendations for ${prospect.businessName}: ${draft.reason} — ${draft.detail}`);
    }

    await logAiUsage("Message", prospectId, draft.data.meta);

    await prisma.message.create({
      data: {
        prospectId,
        direction: "OUTBOUND",
        status: "PENDING_APPROVAL",
        approvalTier: "AI_PREPARED",
        subject: draft.data.subject,
        body: draft.data.body,
        aiGenerated: true,
      },
    });

    await logEvent("growth_recommendations_drafted", { prospectId, payload: { opportunities } });
  },
};
