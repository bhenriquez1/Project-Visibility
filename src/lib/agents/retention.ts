import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/events";
import { logAiUsage } from "@/lib/cost";
import { computeRetentionSignals, type RetentionSignals } from "@/lib/retention";
import { generateRetentionOutreach } from "@/lib/providers/llm";
import { assertAgentCostBudget } from "@/lib/entitlements";
import type { Agent, AgentAction } from "./types";

interface FlagPayload {
  prospectId: string;
  signals: RetentionSignals;
}

interface DraftPayload {
  prospectId: string;
  businessName: string;
  reasons: string[];
}

function buildReasons(signals: RetentionSignals): string[] {
  const reasons: string[] = [];
  if (signals.visibilityTrend === "down") reasons.push("their visibility score has been trending down");
  if (signals.unansweredReviewCount >= 3) {
    reasons.push(`${signals.unansweredReviewCount} reviews are still awaiting a reply`);
  }
  if (signals.daysSinceLastLogin === null) {
    reasons.push("they've never logged into the portal");
  } else if (signals.daysSinceLastLogin > 30) {
    reasons.push(`they haven't logged into the portal in ${signals.daysSinceLastLogin} days`);
  }
  if (signals.daysUntilRenewal !== null && signals.daysUntilRenewal <= 14) {
    reasons.push(`their renewal is in ${signals.daysUntilRenewal} days`);
  }
  return reasons;
}

async function hasCostBudget(prospectId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await assertAgentCostBudget(prospectId);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Cost budget check failed." };
  }
}

export const retentionAgent: Agent = {
  name: "retention",
  // Flagging risk is the same non-external read-and-record shape Analytics Agent's cohort
  // snapshot uses; drafting outreach is the same draft-then-approve shape Growth/Onboarding use.
  // Neither offers a discount or makes a promise (that would be FINANCIAL, blocked regardless).
  defaultControlTier: "AI_PREPARED",

  async proposeActions(): Promise<AgentAction[]> {
    const candidates = await prisma.prospect.findMany({
      where: { status: "WON" },
      select: {
        id: true,
        businessName: true,
        email: true,
        messages: { where: { status: "PENDING_APPROVAL" }, select: { id: true }, take: 1 },
      },
      take: 25,
    });

    const actions: AgentAction[] = [];

    for (const p of candidates) {
      const signals = await computeRetentionSignals(p.id);
      if (signals.riskLevel === "low") continue;

      actions.push({
        controlTier: "AUTOMATIC",
        consequence: "ANALYSIS",
        summary: `Flag retention risk: ${p.businessName}`,
        payload: { prospectId: p.id, signals } satisfies FlagPayload,
      });

      if (signals.riskLevel !== "high") continue;
      if (p.messages.length > 0) continue; // duplicate guard — something's already pending approval
      if (!p.email) continue;

      const budget = await hasCostBudget(p.id);
      if (!budget.ok) {
        await logEvent("retention_agent_skipped_cost_budget", { prospectId: p.id, payload: { reason: budget.reason } });
        continue;
      }

      actions.push({
        controlTier: "AI_PREPARED",
        consequence: "DRAFT",
        summary: `Draft retention outreach: ${p.businessName}`,
        payload: { prospectId: p.id, businessName: p.businessName, reasons: buildReasons(signals) } satisfies DraftPayload,
      });
    }

    return actions;
  },

  async execute(action: AgentAction): Promise<void> {
    if (action.consequence === "ANALYSIS") {
      const { prospectId, signals } = action.payload as FlagPayload;
      await logEvent("retention_risk_flagged", { prospectId, payload: { ...signals } });
      return;
    }

    const { prospectId, businessName, reasons } = action.payload as DraftPayload;
    const draft = await generateRetentionOutreach({ businessName, reasons });
    if (!draft.ok) {
      throw new Error(`Couldn't generate retention outreach for ${businessName}: ${draft.reason} — ${draft.detail}`);
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

    await logEvent("retention_outreach_drafted", { prospectId, payload: { reasons } });
  },
};
