import { prisma } from "@/lib/prisma";
import { logAiUsage } from "@/lib/cost";
import { decryptSecret } from "@/lib/crypto";
import { listReviews } from "@/lib/providers/googleBusinessProfile";
import { generateReviewReplyDraft } from "@/lib/providers/llm";
import type { GoogleBusinessConnection, ReviewReply } from "@/generated/prisma/client";

/**
 * Shared by the customer portal (src/lib/actions/customerActions.ts, human-triggered) and the
 * Reputation Agent (src/lib/agents/reputation.ts, agent-triggered) so a future fix to either the
 * sync or draft logic only has to happen in one place.
 */
export async function syncReviewsForProspect(
  prospectId: string,
  connection: GoogleBusinessConnection
): Promise<{ count: number }> {
  const reviews = await listReviews(decryptSecret(connection.encryptedRefreshToken));
  if (!reviews.ok) {
    throw new Error(`Couldn't sync reviews: ${reviews.reason} — ${reviews.detail}`);
  }

  for (const review of reviews.data) {
    await prisma.reviewReply.upsert({
      where: { prospectId_googleReviewId: { prospectId, googleReviewId: review.resourceName } },
      update: {
        reviewerName: review.reviewerName,
        reviewRating: review.starRating,
        reviewComment: review.comment,
        reviewCreatedAt: review.createTime ? new Date(review.createTime) : null,
      },
      create: {
        prospectId,
        googleReviewId: review.resourceName,
        reviewerName: review.reviewerName,
        reviewRating: review.starRating,
        reviewComment: review.comment,
        reviewCreatedAt: review.createTime ? new Date(review.createTime) : null,
        draftReply: "",
        status: "DRAFT",
        aiGenerated: false,
      },
    });
  }

  return { count: reviews.data.length };
}

export async function draftReviewReply(reviewReply: ReviewReply, businessName: string): Promise<void> {
  const draft = await generateReviewReplyDraft({
    businessName,
    reviewerName: reviewReply.reviewerName,
    starRating: reviewReply.reviewRating,
    reviewComment: reviewReply.reviewComment,
  });

  if (!draft.ok) {
    throw new Error(`Couldn't generate a draft: ${draft.reason} — ${draft.detail}`);
  }

  await logAiUsage("ReviewReply", reviewReply.prospectId, draft.data.meta);

  await prisma.reviewReply.update({
    where: { id: reviewReply.id },
    data: { draftReply: draft.data.reply, status: "PENDING_CUSTOMER_APPROVAL", aiGenerated: true },
  });
}
