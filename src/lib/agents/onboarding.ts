import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/events";
import { logAiUsage } from "@/lib/cost";
import { generateOnboardingNudge } from "@/lib/providers/llm";
import type { Agent, AgentAction } from "./types";

type MissingStep = "gbp_connection" | "objectives";

interface NudgePayload {
  prospectId: string;
  missing: MissingStep;
}

interface CompletePayload {
  prospectId: string;
}

/**
 * Can't literally "collect" an OAuth grant or interview a customer — those require the
 * customer's own action. What this agent actually does: notice what's missing for a newly-WON
 * customer and either draft a nudge (still gated behind Brian's approve-and-send, exactly like
 * Sales Agent) or record that onboarding is already satisfied. Never invents a customer's
 * objectives or pretends a permission was granted.
 */
export const onboardingAgent: Agent = {
  name: "onboarding",
  defaultControlTier: "AI_PREPARED",

  async proposeActions(): Promise<AgentAction[]> {
    const candidates = await prisma.prospect.findMany({
      // Excludes prospects with a nudge already awaiting Brian's approval — otherwise running
      // this twice before he decides on the first draft would draft a duplicate.
      where: {
        status: "WON",
        onboardingCompletedAt: null,
        messages: { none: { status: "PENDING_APPROVAL" } },
      },
      select: {
        id: true,
        businessName: true,
        email: true,
        businessObjectives: true,
        googleBusinessConnection: { select: { revokedAt: true } },
      },
      take: 25,
    });

    const actions: AgentAction[] = [];
    let skippedNoEmail = 0;

    for (const p of candidates) {
      const gbpConnected = Boolean(p.googleBusinessConnection && !p.googleBusinessConnection.revokedAt);
      const hasObjectives = Boolean(p.businessObjectives);

      if (gbpConnected && hasObjectives) {
        actions.push({
          controlTier: "AUTOMATIC",
          consequence: "INTERNAL_RECORD",
          summary: `Mark onboarding complete: ${p.businessName}`,
          payload: { prospectId: p.id } satisfies CompletePayload,
        });
        continue;
      }

      if (!p.email) {
        skippedNoEmail += 1;
        continue;
      }

      const missing: MissingStep = !gbpConnected ? "gbp_connection" : "objectives";
      actions.push({
        controlTier: "AI_PREPARED",
        consequence: "DRAFT",
        summary: `Draft onboarding nudge (${missing}): ${p.businessName}`,
        payload: { prospectId: p.id, missing } satisfies NudgePayload,
      });
    }

    if (skippedNoEmail > 0) {
      await logEvent("onboarding_agent_skipped_no_email", { payload: { count: skippedNoEmail } });
    }

    return actions;
  },

  async execute(action: AgentAction): Promise<void> {
    if (action.consequence === "INTERNAL_RECORD") {
      const { prospectId } = action.payload as CompletePayload;
      await prisma.prospect.update({
        where: { id: prospectId },
        data: { onboardingCompletedAt: new Date() },
      });
      await logEvent("onboarding_completed", { prospectId });
      return;
    }

    const { prospectId, missing } = action.payload as NudgePayload;
    const prospect = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } });
    if (!prospect.email) return; // re-checked defensively; proposeActions already filters this.

    const draft = await generateOnboardingNudge({ businessName: prospect.businessName, missing });
    if (!draft.ok) {
      throw new Error(`Couldn't generate an onboarding nudge for ${prospect.businessName}: ${draft.reason} — ${draft.detail}`);
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

    await logEvent("onboarding_nudge_drafted", { prospectId, payload: { missing } });
  },
};
