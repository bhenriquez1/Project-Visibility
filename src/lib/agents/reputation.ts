import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/events";
import { syncReviewsForProspect, draftReviewReply } from "@/lib/reviews/reviewSync";
import { assertMonthlyEventEntitlement, assertMonthlyAiEntitlement } from "@/lib/entitlements";
import type { Agent, AgentAction } from "./types";

interface SyncPayload {
  prospectId: string;
}

interface DraftPayload {
  reviewReplyId: string;
  prospectId: string;
  businessName: string;
}

async function hasEntitlement(check: () => Promise<void>): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await check();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Entitlement check failed." };
  }
}

export const reputationAgent: Agent = {
  name: "reputation",
  // Syncing reviews is the same non-external read Audit Agent-style analysis performs; drafting
  // a reply is the same draft-then-approve shape every other agent uses. Posting a reply to a
  // customer's public Google listing is EXTERNAL_COMMUNICATION and stays behind the existing
  // customer-approved approveAndPostReviewReply() action — this agent never calls postReviewReply.
  defaultControlTier: "AI_PREPARED",

  async proposeActions(): Promise<AgentAction[]> {
    const candidates = await prisma.prospect.findMany({
      where: { status: "WON" },
      select: {
        id: true,
        businessName: true,
        googleBusinessConnection: { select: { revokedAt: true } },
      },
      take: 25,
    });

    const actions: AgentAction[] = [];

    for (const p of candidates) {
      const gbpConnected = Boolean(p.googleBusinessConnection && !p.googleBusinessConnection.revokedAt);
      if (!gbpConnected) continue;

      const syncBudget = await hasEntitlement(() =>
        assertMonthlyEventEntitlement(p.id, "reviewSyncsPerMonth", "reviews_synced", "review syncs")
      );
      if (syncBudget.ok) {
        actions.push({
          controlTier: "AUTOMATIC",
          consequence: "ANALYSIS",
          summary: `Sync reviews: ${p.businessName}`,
          payload: { prospectId: p.id } satisfies SyncPayload,
        });
      } else {
        await logEvent("reputation_agent_skipped_sync_limit", { prospectId: p.id, payload: { reason: syncBudget.reason } });
      }

      const unansweredReviews = await prisma.reviewReply.findMany({
        where: { prospectId: p.id, status: "DRAFT" },
        select: { id: true },
      });

      let skippedDraftLimit = 0;
      for (const review of unansweredReviews) {
        const draftBudget = await hasEntitlement(() =>
          assertMonthlyAiEntitlement(p.id, "reviewDraftsPerMonth", "ReviewReply", "review reply drafts")
        );
        if (!draftBudget.ok) {
          skippedDraftLimit += 1;
          continue;
        }
        actions.push({
          controlTier: "AI_PREPARED",
          consequence: "DRAFT",
          summary: `Draft review reply: ${p.businessName}`,
          payload: { reviewReplyId: review.id, prospectId: p.id, businessName: p.businessName } satisfies DraftPayload,
        });
      }

      if (skippedDraftLimit > 0) {
        await logEvent("reputation_agent_skipped_draft_limit", { prospectId: p.id, payload: { count: skippedDraftLimit } });
      }
    }

    return actions;
  },

  async execute(action: AgentAction): Promise<void> {
    if (action.consequence === "ANALYSIS") {
      const { prospectId } = action.payload as SyncPayload;
      const connection = await prisma.googleBusinessConnection.findUnique({ where: { prospectId } });
      if (!connection) return; // revoked between proposeActions and execute — nothing to sync.

      const { count } = await syncReviewsForProspect(prospectId, connection);
      await logEvent("reviews_synced", { prospectId, payload: { count, source: "reputation_agent" } });
      return;
    }

    const { reviewReplyId, businessName } = action.payload as DraftPayload;
    const reviewReply = await prisma.reviewReply.findUnique({ where: { id: reviewReplyId } });
    if (!reviewReply || reviewReply.status !== "DRAFT") return; // already acted on since proposeActions ran.

    await draftReviewReply(reviewReply, businessName);
  },
};
