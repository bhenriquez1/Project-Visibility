import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/events";
import { logAiUsage } from "@/lib/cost";
import { generateEstimateFollowUp } from "@/lib/providers/llm";
import type { Agent, AgentAction } from "./types";

// Additive to ROADMAP.md's fixed 8-agent V3 pipeline (scout → ... → retention), not part of it —
// this acts on a Prospect's own leads/estimates, a different relationship than any of those 8
// agents manage, so it gets its own name rather than being bolted onto sales.ts or retention.ts.
const FOLLOW_UP_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

interface DraftPayload {
  estimateId: string;
  prospectId: string;
  customerName: string;
  serviceDescription: string;
  amountCents: number;
  daysSinceSent: number;
}

export const estimateFollowUpAgent: Agent = {
  name: "estimateFollowUp",
  // Drafting a follow-up is the same email-draft-then-approve shape every other agent uses; the
  // business (not Brian) approves and sends it, since it's addressed to their own lead — same
  // control path already established for ReviewReply.
  defaultControlTier: "AI_PREPARED",

  async proposeActions(): Promise<AgentAction[]> {
    const cutoff = new Date(Date.now() - FOLLOW_UP_THRESHOLD_MS);
    const candidates = await prisma.estimate.findMany({
      where: { status: "SENT", customerEmail: { not: null }, sentAt: { lte: cutoff } },
      take: 25,
    });

    return candidates.map((estimate) => ({
      controlTier: "AI_PREPARED",
      consequence: "DRAFT",
      summary: `Draft estimate follow-up: ${estimate.customerName}`,
      payload: {
        estimateId: estimate.id,
        prospectId: estimate.prospectId,
        customerName: estimate.customerName,
        serviceDescription: estimate.serviceDescription,
        amountCents: estimate.amountCents,
        daysSinceSent: Math.floor((Date.now() - estimate.sentAt.getTime()) / (1000 * 60 * 60 * 24)),
      } satisfies DraftPayload,
    }));
  },

  async execute(action: AgentAction): Promise<void> {
    const { estimateId, customerName, serviceDescription, amountCents, daysSinceSent } =
      action.payload as DraftPayload;

    // Re-check status defensively — it may have been dismissed/resolved since proposeActions ran.
    const estimate = await prisma.estimate.findUnique({ where: { id: estimateId } });
    if (!estimate || estimate.status !== "SENT") return;

    const draft = await generateEstimateFollowUp({ customerName, serviceDescription, amountCents, daysSinceSent });
    if (!draft.ok) {
      throw new Error(`Couldn't generate an estimate follow-up for ${customerName}: ${draft.reason} — ${draft.detail}`);
    }

    await logAiUsage("Estimate", estimateId, draft.data.meta);

    await prisma.estimate.update({
      where: { id: estimateId },
      data: {
        followUpSubject: draft.data.subject,
        followUpBody: draft.data.body,
        followUpAiGenerated: true,
        status: "FOLLOW_UP_DRAFTED",
      },
    });

    await logEvent("estimate_follow_up_drafted", { prospectId: estimate.prospectId, payload: { estimateId } });
  },
};
