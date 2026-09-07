import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/events";
import { logAiUsage } from "@/lib/cost";
import { generateOutreachDraft } from "@/lib/providers/llm";
import type { Agent, AgentAction } from "./types";
import { discoverPublicContactEmail } from "@/lib/providers/website";

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
    for (const p of candidates) {
      actions.push({
        controlTier: "AI_PREPARED",
        consequence: "DRAFT",
        summary: `Draft outreach: ${p.businessName}`,
        payload: { prospectId: p.id } satisfies SalesPayload,
      });
    }

    return actions;
  },

  async execute(action: AgentAction): Promise<void> {
    const { prospectId } = action.payload as SalesPayload;

    const prospect = await prisma.prospect.findUniqueOrThrow({
      where: { id: prospectId },
      include: { audits: { orderBy: { requestedAt: "desc" }, take: 1 } },
    });

    let contactEmail = prospect.email;
    if (!contactEmail) {
      const discovered = await discoverPublicContactEmail(prospect.website);
      if (!discovered.ok) {
        await logEvent("sales_agent_skipped_no_email", {
          prospectId,
          payload: { reason: discovered.detail },
        });
        return;
      }
      const owner = await prisma.prospect.findUnique({ where: { email: discovered.data.email }, select: { id: true } });
      if (owner && owner.id !== prospectId) {
        await logEvent("sales_agent_skipped_duplicate_email", { prospectId, payload: { existingProspectId: owner.id } });
        return;
      }
      contactEmail = discovered.data.email;
      await prisma.prospect.update({ where: { id: prospectId }, data: { email: contactEmail } });
      await logEvent("contact_email_discovered", { prospectId, payload: { sourceUrl: discovered.data.sourceUrl, method: "public_business_website" } });
    }

    const latestAudit = prospect.audits[0];
    const narrative = latestAudit?.narrative ?? "No completed audit narrative is available yet.";

    const draft = await generateOutreachDraft({
      businessName: prospect.businessName,
      contactEmail,
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
