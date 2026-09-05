import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/events";
import { logAiUsage } from "@/lib/cost";
import { generateOutreachDraft } from "@/lib/providers/llm";
import type { Agent, AgentAction } from "./types";

interface SalesPayload {
  prospectId: string;
}

export const salesAgent: Agent = {
  name: "sales",
  // Drafting is automatable, but nothing sends without Brian's explicit approval — "executing"
  // this action means creating the same PENDING_APPROVAL Message row the manual "Generate
  // outreach draft" button already creates (src/lib/actions/prospectActions.ts). Sending stays
  // behind approveAndSendMessage, unchanged.
  defaultControlTier: "AI_PREPARED",

  async proposeActions(): Promise<AgentAction[]> {
    const candidates = await prisma.prospect.findMany({
      where: { status: "AUDITED", messages: { none: {} } },
      select: { id: true, businessName: true, email: true },
      take: 25,
    });

    const actions: AgentAction[] = [];
    let skippedNoEmail = 0;

    for (const p of candidates) {
      if (!p.email) {
        skippedNoEmail += 1;
        continue;
      }
      actions.push({
        controlTier: "AI_PREPARED",
        consequence: "DRAFT",
        summary: `Draft outreach: ${p.businessName}`,
        payload: { prospectId: p.id } satisfies SalesPayload,
      });
    }

    if (skippedNoEmail > 0) {
      await logEvent("sales_agent_skipped_no_email", { payload: { count: skippedNoEmail } });
    }

    return actions;
  },

  async execute(action: AgentAction): Promise<void> {
    const { prospectId } = action.payload as SalesPayload;

    const prospect = await prisma.prospect.findUniqueOrThrow({
      where: { id: prospectId },
      include: { audits: { orderBy: { requestedAt: "desc" }, take: 1 } },
    });

    if (!prospect.email) return; // re-checked defensively; proposeActions already filters this.

    const latestAudit = prospect.audits[0];
    const narrative = latestAudit?.narrative ?? "No completed audit narrative is available yet.";

    const draft = await generateOutreachDraft({
      businessName: prospect.businessName,
      contactEmail: prospect.email,
      auditNarrative: narrative,
    });

    if (!draft.ok) {
      throw new Error(`Couldn't generate a draft for ${prospect.businessName}: ${draft.reason} — ${draft.detail}`);
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

    await logEvent("outreach_drafted", { prospectId, payload: { source: "sales_agent" } });
  },
};
